import * as vscode from 'vscode'
import { logger } from './logger'
import * as cp from 'child_process'
import * as util from 'util'
const execFileAsync = util.promisify(cp.execFile)
import { type DiagElementData } from './api/ExtensionApiClient'
import { DiagramTreeProvider } from './tree/DiagramTreeProvider'
import { ElementLibraryTreeProvider } from './tree/ElementLibraryTreeProvider'
import { WebviewManager } from './webview/WebviewManager'
import { openWorkspaceSourceLink, type SourceLinkMessage, WorkspaceSymbolService } from './webview/WorkspaceSymbolService'
import { MessageRouter } from './webview/MessageRouter'
import type { WebviewToExtensionMessage } from './webview/vscodeMessages'
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
import { CLIManager } from './cli/CLIManager'

const INSTALL_COMMAND_UNIX = 'curl -LsSf https://tldiagram.com/install.sh | sh'
const INSTALL_COMMAND_WINDOWS = 'powershell -ExecutionPolicy ByPass -c "irm https://tldiagram.com/install.ps1 | iex"'

type PaletteChoice = {
  label: string
  description: string
  accent: string
  canvas: string
  element: string
}

const TLD_PALETTES: PaletteChoice[] = [
  {
    label: '$(symbol-color) Blue', description: 'Blue accent with dark canvas', accent: '#63b3ed', canvas: '#10151f', element: '#1f2937'
  },
  { label: '$(symbol-color) Forest', description: 'Green accent with deep neutral canvas', accent: '#34d399', canvas: '#101816', element: '#1f2a24' },
  { label: '$(symbol-color) Ember', description: 'Warm accent with charcoal canvas', accent: '#f97316', canvas: '#181412', element: '#2a211c' },
]

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

async function execFileLogged(file: string, args: string[], options?: cp.ExecFileOptions): Promise<{ stdout: string; stderr: string }> {
  const command = [file, ...args].join(' ')
  logger.info('extension', 'Running command', { command, cwd: options?.cwd })
  try {
    const result = await execFileAsync(file, args, options)
    const stdout = String(result.stdout)
    const stderr = String(result.stderr)
    logCommandOutput(command, 'stdout', stdout)
    logCommandOutput(command, 'stderr', stderr)
    return { stdout, stderr }
  } catch (error) {
    const execError = error as cp.ExecFileException & { stdout?: string; stderr?: string }
    logCommandOutput(command, 'stdout', execError.stdout ?? '')
    logCommandOutput(command, 'stderr', execError.stderr ?? '')
    throw error
  }
}

export function activate(context: vscode.ExtensionContext): void {
  logger.init(context)
  logger.info('extension', 'Activating local CLI mode')

  const modeManager = new ModeManager()
  const cliManager = new CLIManager()
  context.subscriptions.push(new vscode.Disposable(() => { void modeManager.dispose() }))
  modeManager.refreshFeatureContexts()

  let dataSource: DataSource | undefined
  let lastPostedWebviewMessage: { diagramId: number; message: unknown } | undefined
  let bootstrapError: unknown

  const treeProvider = new DiagramTreeProvider(undefined as unknown as DataSource)
  const webviewManager = new WebviewManager(
    context.extensionUri,
    undefined,
    process.env.TLDIAGRAM_E2E === '1'
      ? (diagramId, message) => { lastPostedWebviewMessage = { diagramId, message } }
      : undefined,
  )
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
    const isUriArg = args instanceof vscode.Uri
    if (args && !isUriArg && typeof args.elementId === 'number') {
      return {
        id: args.elementId,
        name: args.elementName ?? `Element ${args.elementId}`,
        type: 'Component',
      }
    }
    const targetUri = isUriArg
      ? args
      : vscode.window.activeTextEditor?.document.uri
    if (!targetUri) return undefined
    const relPath = getWorkspaceRelativePath(targetUri)
    if (!relPath) return undefined
    const elementsForFile = async (): Promise<DiagElementData[]> => {
      let elements = elementCacheService.getElementsForFile(relPath)
      if (elements.length === 0) {
        await elementCacheService.refresh()
        elements = elementCacheService.getElementsForFile(relPath)
      }
      return elements
    }
    const elementsForSymbol = async (symbolName: string): Promise<DiagElementData[]> => {
      let elements = elementCacheService.getElementsForSymbol(relPath, symbolName)
      if (elements.length === 0) {
        await elementCacheService.refresh()
        elements = elementCacheService.getElementsForSymbol(relPath, symbolName)
      }
      return elements
    }
    const activeEditor = vscode.window.activeTextEditor
    const isActiveTarget = !!activeEditor && activeEditor.document.uri.toString() === targetUri.toString()
    if (!isActiveTarget) {
      return pickElement(
        await elementsForFile(),
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
        await elementsForSymbol(selectedSymbol.name),
        `Select an element for ${selectedSymbol.name}`,
      )
      if (element) return element
    }
    if (selectedText) {
      return pickElement(
        await elementsForSymbol(selectedText),
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

  const refreshCliInstalledContext = async (): Promise<boolean> => {
    const tldPath = await cliManager.detect()
    const installed = !!tldPath
    void vscode.commands.executeCommand('setContext', 'tldiagram.cliInstalled', installed)
    return installed
  }

  void refreshCliInstalledContext()

  const updateAllProviders = (ds: DataSource): void => {
    treeProvider.updateClient(ds)
    elementLibraryTreeProvider.updateClient(ds)
    elementCacheService.updateClient(ds)
    webviewManager.setDataSource(ds)
  }

  // Watch services — created when entering local mode
  let watchService: WatchService | undefined
  let watchDiffProvider: WatchDiffProvider | undefined
  let watchStatusBar: WatchStatusBar | undefined
  let watchDiffView: vscode.TreeView<unknown> | undefined

  const initWatch = (ds: DataSource): void => {
    if (ds.mode !== 'local') return
    const localDs = ds as any
    const activeWatchService = typeof localDs.getWatchService === 'function'
      ? localDs.getWatchService() as WatchService | undefined
      : undefined
    if (!localDs.baseUrl || !activeWatchService) return

    watchService = activeWatchService
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

  // Bootstrap: initialize mode
  const bootstrapPromise = modeManager.initialize().then((ds) => {
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
  }).catch((e) => {
    bootstrapError = e
    logger.warn('extension', 'Bootstrap failed', { error: String(e) })
  })

  // ── Commands ──────────────────────────────────────────────────────────────

  const onModeChange = (ds: DataSource): void => {
    disposeWatch()
    updateAllProviders(ds)
    initWatch(ds)
    treeProvider.refresh()
    elementLibraryTreeProvider.refresh()
    void elementCacheService.refresh()
  }

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('tldiagram.cliPath')) {
      void refreshCliInstalledContext()
    }
  }))

  context.subscriptions.push(
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
        vscode.window.showErrorMessage('Not connected. Verify the tld CLI and reconnect local mode.')
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
      const baseUrl = dataSource?.mode === 'local' ? (dataSource as any).baseUrl : undefined
      if (!baseUrl) {
        vscode.window.showErrorMessage('Not connected to a local tld workspace.')
        return
      }
      const url = `${baseUrl}/views/${item.diagram.id}`
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
      const modes: Array<{ label: string; description: string; mode: 'local' }> = [
        { label: '$(device-desktop) Local Mode', description: 'Use local tld CLI', mode: 'local' as const },
      ]
      const selected = await vscode.window.showQuickPick(modes, {
        placeHolder: `Current: ${dataSource?.mode ?? 'none'}`,
      })
      if (!selected) return

      try {
        let ds: DataSource | undefined
        ds = await modeManager.switchToLocal()
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
        if (dataSource?.mode === 'local') {
          try {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.'
            await dataSource.startWatch(root)
            disposeWatch()
            initWatch(dataSource)
            treeProvider.refresh()
            elementLibraryTreeProvider.refresh()
            void elementCacheService.refresh()
            vscode.window.showInformationMessage('tlDiagram watch started')
          } catch (e) {
            logger.error('extension', 'startWatch failed', { error: String(e) })
            vscode.window.showErrorMessage(`Watch failed: ${e instanceof Error ? e.message : String(e)}`)
          }
          return
        }
        vscode.window.showErrorMessage('Watch is only available in local mode.')
        return
      }
      try {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '.'
        if (dataSource?.mode === 'local') {
          await dataSource.startWatch(root)
          disposeWatch()
          initWatch(dataSource)
        } else {
          await watchService.start()
        }
        vscode.window.showInformationMessage('tlDiagram watch started')
      } catch (e) {
        logger.error('extension', 'startWatch failed', { error: String(e) })
        vscode.window.showErrorMessage(`Watch failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }),

    vscode.commands.registerCommand('tldiagram.stopWatch', async () => {
      logger.info('extension', 'Command: stopWatch')
      if (!watchService) return
      if (dataSource?.mode === 'local') {
        await dataSource.stopWatch()
      } else {
        await watchService.stop()
      }
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

    vscode.commands.registerCommand('tldiagram.installCli', async () => {
      logger.info('extension', 'Command: installCli')
      const command = process.platform === 'win32' ? INSTALL_COMMAND_WINDOWS : INSTALL_COMMAND_UNIX
      const sourceUrl = 'https://github.com/Mertcikla/tld'
      const install = await vscode.window.showWarningMessage(
        `This will run the official open-source tld CLI installer in a VS Code terminal. Source: ${sourceUrl}`,
        { modal: true },
        'Install CLI',
      )
      if (install !== 'Install CLI') return

      const terminal = vscode.window.createTerminal('tlDiagram CLI Install')
      terminal.show()
      terminal.sendText(command, true)
    }),

    vscode.commands.registerCommand('tldiagram.updateCli', async () => {
      await vscode.commands.executeCommand('tldiagram.installCli')
    }),

    vscode.commands.registerCommand('tldiagram.verifyCli', async () => {
      logger.info('extension', 'Command: verifyCli')
      const tldPath = await cliManager.detect()
      if (!tldPath) {
        void vscode.commands.executeCommand('setContext', 'tldiagram.cliInstalled', false)
        vscode.window.showErrorMessage('The "tld" CLI was not found. Set "tlDiagram › Cli Path" or install tld on PATH.')
        return
      }
      const version = await cliManager.getVersion()
      void vscode.commands.executeCommand('setContext', 'tldiagram.cliInstalled', true)
      vscode.window.showInformationMessage(`tlDiagram CLI: ${version ?? tldPath}`)
    }),

    vscode.commands.registerCommand('tldiagram.openDocs', async () => {
      logger.info('extension', 'Command: openDocs')
      await vscode.env.openExternal(vscode.Uri.parse('https://tldiagram.com/docs'))
    }),

    vscode.commands.registerCommand('tldiagram.focusDiagramsView', async () => {
      logger.info('extension', 'Command: focusDiagramsView')
      await vscode.commands.executeCommand('tldiagram.diagramTree.focus')
    }),

    vscode.commands.registerCommand('tldiagram.focusElementLibraryView', async () => {
      logger.info('extension', 'Command: focusElementLibraryView')
      await vscode.commands.executeCommand('tldiagram.elementLibrary.focus')
    }),

    vscode.commands.registerCommand('tldiagram.configureColors', async () => {
      logger.info('extension', 'Command: configureColors')
      const config = vscode.workspace.getConfiguration('tldiagram')
      const options = [
        {
          label: '$(color-mode) Import VS Code Theme Colors',
          description: 'Default',
          action: 'vscodeTheme' as const,
        },
        ...TLD_PALETTES.map((palette) => ({
          ...palette,
          action: 'palette' as const,
        })),
        {
          label: '$(settings-gear) Customize Palette Settings',
          description: 'Open tlDiagram color settings',
          action: 'settings' as const,
        },
      ]
      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Choose tlDiagram UI colors',
      })
      if (!selected) return

      if (selected.action === 'settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:tlDiagram-com.tldiagram colors')
        return
      }

      if (selected.action === 'vscodeTheme') {
        await config.update('uiColorMode', 'vscodeTheme', vscode.ConfigurationTarget.Global)
        vscode.window.showInformationMessage('tlDiagram will import VS Code theme colors in new diagram panels.')
        return
      }

      await config.update('uiColorMode', 'palette', vscode.ConfigurationTarget.Global)
      await config.update('paletteAccent', selected.accent, vscode.ConfigurationTarget.Global)
      await config.update('paletteCanvas', selected.canvas, vscode.ConfigurationTarget.Global)
      await config.update('paletteElement', selected.element, vscode.ConfigurationTarget.Global)
      vscode.window.showInformationMessage('tlDiagram palette colors will apply to new diagram panels.')
    }),

    vscode.commands.registerCommand('tldiagram.goToDiagram', async (args?: { elementId?: number; elementName?: string } | vscode.Uri) => {
      logger.info('extension', 'Command: goToDiagram', args)
      if (!dataSource) {
        vscode.window.showErrorMessage('Not connected. Verify the tld CLI and reconnect local mode.')
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
        vscode.window.showErrorMessage('Not connected. Verify the tld CLI and reconnect local mode.')
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
          const tldPath = await cliManager.detect()
          if (!tldPath) {
            vscode.window.showErrorMessage('The "tld" CLI was not found. Set "tlDiagram › Cli Path" or install tld on PATH.')
            return
          }

          try {
            await execFileLogged(tldPath, ['--version'])
          } catch {
            vscode.window.showErrorMessage('The configured "tld" CLI could not be executed.')
            return
          }

          try {
            try {
              await execFileLogged(tldPath, ['init'], { cwd: targetPath })
            } catch (initErr: any) {
              if (!initErr.message?.includes('already exists')) {
                throw new Error(`Init failed: ${initErr.message}`)
              }
            }
            await execFileLogged(tldPath, ['analyze', '.'], { cwd: targetPath })
            vscode.window.showInformationMessage('Successfully analyzed code models locally!')
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

  if (process.env.TLDIAGRAM_E2E === '1') {
    context.subscriptions.push(
      vscode.commands.registerCommand('tldiagram.test.waitForReady', async () => {
        await bootstrapPromise
        if (bootstrapError) throw bootstrapError
        await elementCacheService.refresh()
        return dataSource?.mode
      }),
      vscode.commands.registerCommand('tldiagram.test.openSourceFromWebview', async (msg: SourceLinkMessage) => {
        return openWorkspaceSourceLink(msg)
      }),
      vscode.commands.registerCommand('tldiagram.test.dispatchWebviewMessage', async (msg: WebviewToExtensionMessage) => {
        const router = new MessageRouter()
        new WorkspaceSymbolService(() => {}, router)
        await router.dispatch(msg)
      }),
      vscode.commands.registerCommand('tldiagram.test.getLastPostedWebviewMessage', () => lastPostedWebviewMessage),
    )
  }

  logger.info('extension', 'Activation complete')
}

export function deactivate(): void {
  logger.info('extension', 'Deactivating')
}
