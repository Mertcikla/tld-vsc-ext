import * as vscode from 'vscode'
import { logger } from './logger'
import { AuthManager } from './auth/AuthManager'
import { AuthUriHandler } from './auth/AuthUriHandler'
import * as cp from 'child_process'
import * as util from 'util'
const execAsync = util.promisify(cp.exec)
import { type DiagElementData } from './api/ExtensionApiClient'
import { DiagramTreeProvider } from './tree/DiagramTreeProvider'
import { ElementLibraryTreeProvider } from './tree/ElementLibraryTreeProvider'
import { WebviewManager } from './webview/WebviewManager'
import type { DiagramTreeItem } from './tree/DiagramTreeItem'
import type { ElementTreeItem } from './tree/ElementTreeItem'
import { GitContextService } from './GitContextService'
import { ElementCacheService } from './ElementCacheService'
import { TLDiagramCodeLensProvider } from './TLDiagramCodeLensProvider'
import { ModeManager } from './modes/ModeManager'
import type { DataSource } from './datasource/DataSource'
import { WatchService } from './watch/WatchService'
import { WatchDiffProvider } from './watch/WatchDiffProvider'
import { WatchStatusBar } from './watch/WatchStatusBar'
import { WorkspaceSymbolProvider } from './provider/WorkspaceSymbolProvider'
import { SyncService } from './sync/SyncService'
import { SyncStatusBar } from './sync/SyncStatusBar'
import { DiffDocument } from './sync/DiffDocument'

function getServerUrl(): string {
  return vscode.workspace
    .getConfiguration('tldiagram')
    .get<string>('serverUrl', 'https://tldiagram.com')
    .replace(/\/$/, '')
}

function logCommandOutput(command: string, stream: 'stdout' | 'stderr', output: string): void {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    if (stream === 'stderr') {
      logger.warn('extension', `${command} ${stream}`, { line })
    } else {
      logger.info('extension', `${command} ${stream}`, { line })
    }
  }
}

async function execLogged(command: string, options?: cp.ExecOptions): Promise<{ stdout: string; stderr: string }> {
  logger.info('extension', 'Running command', { command, cwd: options?.cwd })
  try {
    const result = await execAsync(command, options)
    logCommandOutput(command, 'stdout', result.stdout)
    logCommandOutput(command, 'stderr', result.stderr)
    return result
  } catch (error) {
    const execError = error as cp.ExecException & { stdout?: string; stderr?: string }
    logCommandOutput(command, 'stdout', execError.stdout ?? '')
    logCommandOutput(command, 'stderr', execError.stderr ?? '')
    throw error
  }
}

export function activate(context: vscode.ExtensionContext): void {
  logger.init(context)
  const serverUrl = getServerUrl()
  logger.info('extension', 'Activating', { serverUrl })

  const authManager = new AuthManager(context.secrets, serverUrl)
  const authUriHandler = new AuthUriHandler()
  context.subscriptions.push(vscode.window.registerUriHandler(authUriHandler))

  const modeManager = new ModeManager(authManager)
  context.subscriptions.push(new vscode.Disposable(() => { void modeManager.dispose() }))

  let dataSource: DataSource | undefined

  const treeProvider = new DiagramTreeProvider(undefined as unknown as DataSource)
  const webviewManager = new WebviewManager(context.extensionUri, authManager, serverUrl)
  const gitService = new GitContextService()
  const elementCacheService = new ElementCacheService(undefined as unknown as DataSource, gitService)

  const findInnermostSymbol = (
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position,
  ): vscode.DocumentSymbol | undefined => {
    for (const symbol of symbols) {
      if (!symbol.range.contains(position)) continue
      const childMatch = findInnermostSymbol(symbol.children, position)
      return childMatch ?? symbol
    }
    return undefined
  }

  const getWorkspaceRelativePath = (uri: vscode.Uri): string | undefined => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspaceRoot) return undefined
    const absPath = uri.fsPath
    if (!absPath.startsWith(workspaceRoot + '/')) return undefined
    return absPath.slice(workspaceRoot.length + 1)
  }

  const pickElement = async (
    elements: DiagElementData[],
    placeHolder: string,
  ): Promise<DiagElementData | undefined> => {
    if (elements.length === 0) return undefined
    if (elements.length === 1) return elements[0]
    const picked = await vscode.window.showQuickPick(
      elements.map((element) => ({
        label: element.name,
        description: `Element ${element.id}`,
        element,
      })),
      { placeHolder },
    )
    return picked?.element
  }

  const resolveElementForGoToDiagram = async (
    args?: { elementId?: number; elementName?: string } | vscode.Uri,
  ): Promise<DiagElementData | undefined> => {
    if (args && !vscode.Uri.isUri(args) && typeof args.elementId === 'number') {
      return { id: args.elementId, name: args.elementName ?? `Element ${args.elementId}` }
    }
    const targetUri = vscode.Uri.isUri(args)
      ? args
      : vscode.window.activeTextEditor?.document.uri
    if (!targetUri) return undefined
    const relPath = getWorkspaceRelativePath(targetUri)
    if (!relPath) return undefined
    const activeEditor = vscode.window.activeTextEditor
    const isActiveTarget = !!activeEditor && activeEditor.document.uri.toString() === targetUri.toString()
    if (!isActiveTarget) {
      return pickElement(
        elementCacheService.getElementsForFile(relPath),
        `Select an element from ${relPath}`,
      )
    }
    const selection = activeEditor.selection
    const position = selection.isEmpty ? selection.active : selection.start
    const rawSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      targetUri,
    )
    const symbols = rawSymbols ?? []
    const selectedSymbol = findInnermostSymbol(symbols, position)
    const selectedText = selection.isEmpty
      ? undefined
      : activeEditor.document.getText(selection).trim()
    if (selectedSymbol) {
      const element = await pickElement(
        elementCacheService.getElementsForSymbol(relPath, selectedSymbol.name),
        `Select an element for ${selectedSymbol.name}`,
      )
      if (element) return element
    }
    if (selectedText) {
      return pickElement(
        elementCacheService.getElementsForSymbol(relPath, selectedText),
        `Select an element for ${selectedText}`,
      )
    }
    return undefined
  }

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: '*' },
      new TLDiagramCodeLensProvider(elementCacheService)
    ),
    vscode.languages.registerWorkspaceSymbolProvider(
      new WorkspaceSymbolProvider(elementCacheService)
    )
  )

  const elementLibraryTreeProvider = new ElementLibraryTreeProvider(
    undefined as unknown as DataSource,
    webviewManager,
  )

  const treeView = vscode.window.createTreeView('tldiagram.diagramTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  })
  const elementLibraryView = vscode.window.createTreeView('tldiagram.elementLibrary', {
    treeDataProvider: elementLibraryTreeProvider,
    showCollapseAll: false,
  })
  context.subscriptions.push(treeView, elementLibraryView)

  const updateAllProviders = (ds: DataSource): void => {
    treeProvider.updateClient(ds)
    elementLibraryTreeProvider.updateClient(ds)
    elementCacheService.updateClient(ds)
  }

  // Watch services — created when entering local mode
  let watchService: WatchService | undefined
  let watchDiffProvider: WatchDiffProvider | undefined
  let watchStatusBar: WatchStatusBar | undefined
  let watchDiffView: vscode.TreeView<unknown> | undefined

  const initWatch = (ds: DataSource): void => {
    if (ds.mode !== 'local') return
    const localDs = ds as any
    if (!localDs.baseUrl || !localDs._watchService) return

    const baseUrl = localDs.baseUrl as string
    const repoPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.'

    watchService = new WatchService(baseUrl, repoPath)
    watchDiffProvider = new WatchDiffProvider(watchService)
    watchStatusBar = new WatchStatusBar(watchService)

    watchDiffView = vscode.window.createTreeView('tldiagram.watchDiff', {
      treeDataProvider: watchDiffProvider,
      showCollapseAll: true,
    })
    context.subscriptions.push(watchDiffView)
  }

  const disposeWatch = (): void => {
    watchStatusBar?.dispose()
    watchStatusBar = undefined
    watchDiffView?.dispose()
    watchDiffView = undefined
    watchDiffProvider = undefined
    watchService?.dispose()
    watchService = undefined
  }

  // Sync services
  let syncService: SyncService | undefined
  let syncStatusBar: SyncStatusBar | undefined
  let diffDocument: DiffDocument | undefined

  const initSync = (): void => {
    disposeSync()

    syncService = new SyncService((status) => {
      syncStatusBar?.updateStatus(status)
    })
    syncStatusBar = new SyncStatusBar(syncService)

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (workspaceRoot) {
      syncService.startFileWatcher(workspaceRoot)
      void syncService.getSyncStatus(workspaceRoot).then((status) => {
        syncStatusBar?.updateStatus(status)
      })
    }

    diffDocument = new DiffDocument(syncService)
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider('tldiagram-diff', diffDocument),
    )
  }

  const disposeSync = (): void => {
    syncStatusBar?.dispose()
    syncStatusBar = undefined
    syncService?.dispose()
    syncService = undefined
    diffDocument = undefined
  }

  // Bootstrap: initialize mode
  void modeManager.initialize().then((ds) => {
    if (ds) {
      dataSource = ds
      updateAllProviders(ds)
      initWatch(ds)
      void vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', true)
      treeProvider.refresh()
      elementLibraryTreeProvider.refresh()
      void elementCacheService.refresh()
    }
    logger.info('extension', 'Bootstrap complete', { mode: dataSource?.mode })
  })

  // ── Commands ──────────────────────────────────────────────────────────────

  const onModeChange = (ds: DataSource): void => {
    disposeWatch()
    updateAllProviders(ds)
    initWatch(ds)
    initSync()
    treeProvider.refresh()
    elementLibraryTreeProvider.refresh()
    void elementCacheService.refresh()
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('tldiagram.login', async () => {
      logger.info('extension', 'Command: login')
      try {
        let authDisposable: vscode.Disposable | undefined
        const timeout = 120_000

        const tokenPromise = new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => {
            authDisposable?.dispose()
            reject(new Error('Login timed out after 2 minutes'))
          }, timeout)

          authDisposable = authUriHandler.onDidAuthenticate(({ token, state }) => {
            clearTimeout(timer)
            authDisposable?.dispose()
            resolve(token)
          })
        })

        const loginUrl = `${serverUrl}/auth/vscode?redirect=${encodeURIComponent('vscode://tldiagram-com.tldiagram/auth')}`
        await vscode.env.openExternal(vscode.Uri.parse(loginUrl))
        vscode.window.showInformationMessage('Complete login in your browser to connect tlDiagram.')

        const token = await tokenPromise
        await authManager.storeKey(token)
        logger.info('extension', 'Login successful — switching to cloud mode')

        const ds = await modeManager.switchToCloud()
        dataSource = ds
        onModeChange(ds)
      } catch (e) {
        logger.error('extension', 'Cloud switch after login failed', { error: String(e) })
      }
    }),

    vscode.commands.registerCommand('tldiagram.logout', async () => {
      logger.info('extension', 'Command: logout')
      await authManager.clearKey()
      dataSource = undefined
      void vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', false)

      // Try falling back to local mode
      try {
        const ds = await modeManager.switchToLocal()
        dataSource = ds
        onModeChange(ds)
      } catch {
        treeProvider.clear()
        logger.info('extension', 'Logged out — no local fallback available')
      }
    }),

    vscode.commands.registerCommand('tldiagram.refresh', () => {
      logger.info('extension', 'Command: refresh')
      treeProvider.refresh()
      elementLibraryTreeProvider.refresh()
    }),

    vscode.commands.registerCommand('tldiagram.openDiagram', async (item: DiagramTreeItem) => {
      logger.info('extension', 'Command: openDiagram', { id: item.diagram.id })
      await webviewManager.openDiagram(item)
    }),

    vscode.commands.registerCommand('tldiagram.createDiagram', async () => {
      logger.info('extension', 'Command: createDiagram')
      if (!dataSource) {
        vscode.window.showErrorMessage('Not connected. Run "tlDiagram: Connect / Login" first.')
        return
      }
      const name = await vscode.window.showInputBox({
        prompt: 'Diagram name',
        placeHolder: 'e.g. System Context, Container Diagram',
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() ? null : 'Name cannot be empty'),
      })
      if (!name) return
      try {
        logger.info('extension', 'Creating diagram', { name: name.trim() })
        await dataSource.createDiagram(name.trim())
        treeProvider.refresh()
      } catch (e) {
        logger.error('extension', 'createDiagram failed', { error: String(e) })
        vscode.window.showErrorMessage(
          `Failed to create diagram: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }),

    vscode.commands.registerCommand('tldiagram.renameDiagram', async (item: DiagramTreeItem) => {
      logger.debug('extension', 'Command: renameDiagram', { id: item.diagram.id })
      if (!dataSource) return
      const name = await vscode.window.showInputBox({
        prompt: 'New name',
        value: item.diagram.name,
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() ? null : 'Name cannot be empty'),
      })
      if (!name || name.trim() === item.diagram.name) return
      try {
        logger.info('extension', 'Renaming diagram', { id: item.diagram.id, from: item.diagram.name, to: name.trim() })
        await dataSource.renameDiagram(item.diagram.id, name.trim())
        treeProvider.refresh()
      } catch (e) {
        logger.error('extension', 'renameDiagram failed', { id: item.diagram.id, error: String(e) })
        vscode.window.showErrorMessage(
          `Failed to rename: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }),

    vscode.commands.registerCommand('tldiagram.deleteDiagram', async (item: DiagramTreeItem) => {
      logger.debug('extension', 'Command: deleteDiagram', { id: item.diagram.id })
      if (!dataSource) return
      const answer = await vscode.window.showWarningMessage(
        `Delete "${item.diagram.name}"? This cannot be undone.`,
        { modal: true },
        'Delete',
      )
      if (answer !== 'Delete') {
        logger.debug('extension', 'deleteDiagram: cancelled by user')
        return
      }
      try {
        logger.info('extension', 'Deleting diagram', { id: item.diagram.id, name: item.diagram.name })
        await dataSource.deleteDiagram(item.diagram.id)
        treeProvider.refresh()
        logger.info('extension', 'Diagram deleted', { id: item.diagram.id })
      } catch (e) {
        logger.error('extension', 'deleteDiagram failed', { id: item.diagram.id, error: String(e) })
        vscode.window.showErrorMessage(
          `Failed to delete: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }),

    vscode.commands.registerCommand('tldiagram.openInBrowser', (item: DiagramTreeItem) => {
      const url = `${serverUrl}/app/views/${item.diagram.id}`
      logger.info('extension', 'Command: openInBrowser', { id: item.diagram.id, url })
      void vscode.env.openExternal(vscode.Uri.parse(url))
    }),

    vscode.commands.registerCommand('tldiagram.showLogs', () => {
      logger.show()
    }),

    vscode.commands.registerCommand('tldiagram.addElementToDiagram', (item: ElementTreeItem) => {
      logger.info('extension', 'Command: addElementToDiagram', { elementId: item.element.id, name: item.element.name })
      elementLibraryTreeProvider.addElementToDiagram(item.element)
    }),

    vscode.commands.registerCommand('tldiagram.switchMode', async () => {
      logger.info('extension', 'Command: switchMode')
      const modes = [
        { label: '$(server) Cloud Mode', description: 'Connect to tlDiagram.com API', mode: 'cloud' as const },
        { label: '$(device-desktop) Local Mode', description: 'Use local tld CLI', mode: 'local' as const },
      ]
      const selected = await vscode.window.showQuickPick(modes, {
        placeHolder: `Current: ${dataSource?.mode ?? 'none'}`,
      })
      if (!selected) return

      try {
        let ds: DataSource | undefined
        if (selected.mode === 'cloud') {
          ds = await modeManager.switchToCloud()
        } else {
          ds = await modeManager.switchToLocal()
        }
        if (ds) {
          dataSource = ds
          onModeChange(ds)
        }
      } catch (e) {
        logger.error('extension', 'switchMode failed', { error: String(e) })
        vscode.window.showErrorMessage(
          `Mode switch failed: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }),

    vscode.commands.registerCommand('tldiagram.startWatch', async () => {
      logger.info('extension', 'Command: startWatch')
      if (!watchService) {
        vscode.window.showErrorMessage('Watch is only available in local mode.')
        return
      }
      try {
        await watchService.start()
        vscode.window.showInformationMessage('tlDiagram watch started')
      } catch (e) {
        logger.error('extension', 'startWatch failed', { error: String(e) })
        vscode.window.showErrorMessage(`Watch failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }),

    vscode.commands.registerCommand('tldiagram.stopWatch', async () => {
      logger.info('extension', 'Command: stopWatch')
      if (!watchService) return
      await watchService.stop()
      vscode.window.showInformationMessage('tlDiagram watch stopped')
    }),

    vscode.commands.registerCommand('tldiagram.showWatchDiff', () => {
      logger.info('extension', 'Command: showWatchDiff')
      if (watchDiffView) {
        watchDiffView.reveal(undefined)
      }
      watchDiffProvider?.refresh()
    }),

    vscode.commands.registerCommand('tldiagram.watchQuickActions', async () => {
      logger.info('extension', 'Command: watchQuickActions')
      if (!watchService) return

      const status = watchService.getStatus()
      const actions = []

      if (status.active) {
        actions.push({ label: '$(debug-pause) Pause Watch', action: 'pause' as const })
        actions.push({ label: '$(circle-slash) Stop Watch', action: 'stop' as const })
      } else {
        actions.push({ label: '$(eye) Start Watch', action: 'start' as const })
      }
      actions.push({ label: '$(diff) Show Diff', action: 'diff' as const })
      actions.push({ label: '$(refresh) Rescan', action: 'rescan' as const })

      const selected = await vscode.window.showQuickPick(actions, {
        placeHolder: `Watch: ${status.active ? 'Active' : 'Idle'}`,
      })
      if (!selected) return

      switch (selected.action) {
        case 'start':
          await vscode.commands.executeCommand('tldiagram.startWatch')
          break
        case 'stop':
          await vscode.commands.executeCommand('tldiagram.stopWatch')
          break
        case 'diff':
          await vscode.commands.executeCommand('tldiagram.showWatchDiff')
          break
        case 'rescan':
          await vscode.commands.executeCommand('tldiagram.startWatch')
          break
        case 'pause':
          break
      }
    }),

    vscode.commands.registerCommand('tldiagram.exportToCloud', async () => {
      logger.info('extension', 'Command: exportToCloud')
      if (!syncService) {
        vscode.window.showErrorMessage('Sync is not available. Connect to cloud first.')
        return
      }
      try {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.'
        await syncService.exportToCloud(root)
      } catch (e) {
        logger.error('extension', 'exportToCloud failed', { error: String(e) })
        vscode.window.showErrorMessage(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }),

    vscode.commands.registerCommand('tldiagram.importFromCloud', async () => {
      logger.info('extension', 'Command: importFromCloud')
      if (!syncService) {
        vscode.window.showErrorMessage('Sync is not available. Connect to cloud first.')
        return
      }
      try {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.'
        await syncService.importFromCloud(root)
        treeProvider.refresh()
        elementLibraryTreeProvider.refresh()
        void elementCacheService.refresh()
      } catch (e) {
        logger.error('extension', 'importFromCloud failed', { error: String(e) })
        vscode.window.showErrorMessage(`Import failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }),

    vscode.commands.registerCommand('tldiagram.showSyncStatus', async () => {
      logger.info('extension', 'Command: showSyncStatus')
      if (!syncService) return
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.'
      const status = await syncService.getSyncStatus(root)
      const msg = status.localChanges > 0
        ? `tlDiagram: ${status.localChanges} local change${status.localChanges === 1 ? '' : 's'} pending${status.needsPush ? ' — needs push' : ''}`
        : 'tlDiagram: In sync with cloud'
      vscode.window.showInformationMessage(msg)
    }),

    vscode.commands.registerCommand('tldiagram.diffWithCloud', async () => {
      logger.info('extension', 'Command: diffWithCloud')
      if (!diffDocument) return
      diffDocument.refresh()
      const uri = vscode.Uri.parse('tldiagram-diff://cloud')
      await vscode.window.showTextDocument(uri, { preview: true })
    }),

    vscode.commands.registerCommand('tldiagram.goToDiagram', async (args?: { elementId?: number; elementName?: string } | vscode.Uri) => {
      logger.info('extension', 'Command: goToDiagram', args)
      if (!dataSource) {
        vscode.window.showErrorMessage('Not connected. Run "tlDiagram: Connect with API Key" first.')
        return
      }
      try {
        const element = await resolveElementForGoToDiagram(args)
        if (!element) {
          vscode.window.showErrorMessage('No tlDiagram element found for the current selection.')
          return
        }

        const placements = await dataSource.listElementPlacements(element.id)
        if (placements.length === 0) {
          vscode.window.showInformationMessage('This element is not in any diagrams.')
          return
        }

        let selectedDiagramId: string | undefined = undefined
        let selectedDiagramName: string | undefined = undefined

        if (placements.length === 1) {
          selectedDiagramId = String(placements[0].view_id)
          selectedDiagramName = placements[0].view_name
        } else {
          const items = placements.map(d => ({ label: d.view_name, description: String(d.view_id), diagramId: String(d.view_id) }))
          const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select a diagram to open' })
          if (!selected) return
          selectedDiagramId = selected.diagramId
          selectedDiagramName = selected.label
        }

        if (selectedDiagramId && selectedDiagramName) {
          await webviewManager.openDiagram({ diagram: { id: Number(selectedDiagramId), name: selectedDiagramName } } as DiagramTreeItem)
          setTimeout(() => {
            webviewManager.postMessageToDiagram(Number(selectedDiagramId), { type: 'focus-element', elementId: element.id })
          }, 1000)
        }
      } catch (e) {
        logger.error('extension', 'goToDiagram failed', { error: String(e) })
        vscode.window.showErrorMessage(`Failed to go to diagram: ${e instanceof Error ? e.message : String(e)}`)
      }
    }),

    vscode.commands.registerCommand('tldiagram.analyzeFolder', async (uri?: vscode.Uri) => {
      logger.info('extension', 'Command: analyzeFolder', { uri: uri?.fsPath })
      if (!dataSource) {
        vscode.window.showErrorMessage('Not connected. Run "tlDiagram: Connect / Login" first.')
        return
      }

      const targetPath = uri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath
      if (!targetPath) {
        vscode.window.showErrorMessage('No folder selected to analyze.')
        return
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'tlDiagram: Analyzing workspace...', cancellable: false },
        async () => {
          try {
            await execLogged('tld --version')
          } catch {
            vscode.window.showErrorMessage('The "tld" CLI was not found on your PATH. Please install standard tld release to use this feature.')
            return
          }

          try {
            try {
              await execLogged('tld init', { cwd: targetPath })
            } catch (initErr: any) {
              if (!initErr.message?.includes('already exists')) {
                throw new Error(`Init failed: ${initErr.message}`)
              }
            }
            await execLogged('tld analyze .', { cwd: targetPath })
            await execLogged('tld apply --force', { cwd: targetPath })
            vscode.window.showInformationMessage('Successfully analyzed and synced code models!')
            treeProvider.refresh()
            elementLibraryTreeProvider.refresh()
            void elementCacheService.refresh()
          } catch (e: any) {
            logger.error('extension', 'analyzeFolder failed', { error: String(e) })
            vscode.window.showErrorMessage(`Process failed: ${e.message}`)
          }
        }
      )
    }),
  )

  logger.info('extension', 'Activation complete')
}

export function deactivate(): void {
  logger.info('extension', 'Deactivating')
}
