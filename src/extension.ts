import * as vscode from 'vscode'
import { logger } from './logger'
import { AuthManager } from './auth/AuthManager'
import { AuthUriHandler } from './auth/AuthUriHandler'
import * as crypto from 'crypto'
import * as cp from 'child_process'
import * as util from 'util'
const execAsync = util.promisify(cp.exec)
import { ExtensionApiClient } from './api/ExtensionApiClient'
import { DiagramTreeProvider } from './tree/DiagramTreeProvider'
import { ElementLibraryTreeProvider } from './tree/ElementLibraryTreeProvider'
import { WebviewManager } from './webview/WebviewManager'
import type { DiagramTreeItem } from './tree/DiagramTreeItem'
import type { ElementTreeItem } from './tree/ElementTreeItem'
import { GitContextService } from './GitContextService'
import { ElementCacheService } from './ElementCacheService'
import { TLDiagramCodeLensProvider } from './TLDiagramCodeLensProvider'

function getServerUrl(): string {
  return vscode.workspace
    .getConfiguration('tldiagram')
    .get<string>('serverUrl', 'https://tldiagram.com')
    .replace(/\/$/, '')
}

export function activate(context: vscode.ExtensionContext): void {
  logger.init(context)

  const serverUrl = getServerUrl()
  logger.info('extension', 'Activating', { serverUrl })

  const authManager = new AuthManager(context.secrets, serverUrl)
  const authUriHandler = new AuthUriHandler()
  context.subscriptions.push(vscode.window.registerUriHandler(authUriHandler))

  let client: ExtensionApiClient | undefined
  let currentOrgId: string | undefined

  // Placeholder client so TypeScript is happy; swapped out before use
  const treeProvider = new DiagramTreeProvider(undefined as unknown as ExtensionApiClient)
  const webviewManager = new WebviewManager(context.extensionUri, authManager, serverUrl)

  const gitService = new GitContextService()
  const elementCacheService = new ElementCacheService(undefined as unknown as ExtensionApiClient, gitService)
  
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: '*' },
      new TLDiagramCodeLensProvider(elementCacheService)
    )
  )

  const elementLibraryTreeProvider = new ElementLibraryTreeProvider(
    undefined,
    webviewManager,
  )

  // Always register so VS Code renders the view container immediately
  const treeView = vscode.window.createTreeView('tldiagram.diagramTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  })
  const elementLibraryView = vscode.window.createTreeView('tldiagram.elementLibrary', {
    treeDataProvider: elementLibraryTreeProvider,
    showCollapseAll: false,
  })

  context.subscriptions.push(treeView, elementLibraryView)

  // Bootstrap: if a key is already stored, connect silently
  void authManager.getKey().then(async (key) => {
    if (!key) {
      logger.debug('extension', 'No stored API key — skipping bootstrap')
      return
    }
    logger.info('extension', 'Stored API key found — bootstrapping connection')
    try {
      const newClient = new ExtensionApiClient(serverUrl, key)
      const user = await newClient.getMe()
      client = newClient
      currentOrgId = user.orgId
      treeProvider.updateClient(client)
      elementLibraryTreeProvider.updateClient(client)
      await vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', true)
      treeProvider.refresh()
      elementLibraryTreeProvider.refresh()
      logger.info('extension', 'Bootstrap successful', { username: user.username, orgId: user.orgId })
    } catch (e) {
      logger.error('extension', 'Bootstrap getMe failed', { error: String(e) })
      await authManager.clearKey()
    }
  })

  // ── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('tldiagram.login', async () => {
      logger.debug('extension', 'Command: login')

      const state = crypto.randomUUID()
      const loginUrl = vscode.Uri.parse(`${serverUrl}/app/auth/vscode?state=${state}`)

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Connecting to tlDiagram…', cancellable: true },
        async (progress, token) => {
          logger.info('extension', 'Opening browser for login')
          await vscode.env.openExternal(loginUrl)

          return new Promise<void>((resolve, reject) => {
            const disposable = authUriHandler.onDidAuthenticate(async (event) => {
              if (event.state !== state) {
                logger.error('extension', 'Login failed: State mismatch (CSRF protection)')
                vscode.window.showErrorMessage('Login failed: Security state mismatch.')
                disposable.dispose()
                reject(new Error('State mismatch'))
                return
              }

              try {
                const apiKey = event.token
                logger.info('extension', 'Attempting login with provided token from web')
                const candidateClient = new ExtensionApiClient(serverUrl, apiKey)
                const user = await candidateClient.getMe()
                await authManager.storeKey(apiKey)
                client = candidateClient
                currentOrgId = user.orgId
                treeProvider.updateClient(client)
                elementLibraryTreeProvider.updateClient(client)
                elementCacheService.updateClient(client)
                await vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', true)
                treeProvider.refresh()
                elementLibraryTreeProvider.refresh()
                void elementCacheService.refresh()
                logger.info('extension', 'Login successful', { username: user.username, orgName: user.orgName })
                vscode.window.showInformationMessage('Connected to tlDiagram')
                resolve()
              } catch (e) {
                logger.error('extension', 'Login failed', { error: String(e) })
                vscode.window.showErrorMessage(
                  `Authentication failed: ${e instanceof Error ? e.message : String(e)}`,
                )
                reject(e)
              } finally {
                disposable.dispose()
              }
            })

            token.onCancellationRequested(() => {
              logger.debug('extension', 'login: cancelled')
              disposable.dispose()
              resolve()
            })
          })
        },
      )
    }),

    vscode.commands.registerCommand('tldiagram.logout', async () => {
      logger.info('extension', 'Command: logout')
      await authManager.clearKey()
      client = undefined
      currentOrgId = undefined
      treeProvider.clear()
      elementLibraryTreeProvider.refresh()
      await vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', false)
      vscode.window.showInformationMessage('Disconnected from tlDiagram.')
      logger.info('extension', 'Logout complete')
    }),

    vscode.commands.registerCommand('tldiagram.refresh', () => {
      logger.debug('extension', 'Command: refresh')
      treeProvider.refresh()
      elementLibraryTreeProvider.refresh()
    }),

    vscode.commands.registerCommand('tldiagram.openDiagram', async (item: DiagramTreeItem) => {
      logger.info('extension', 'Command: openDiagram', { id: item.diagram.id, name: item.diagram.name })
      await webviewManager.openDiagram(item)
    }),

    vscode.commands.registerCommand('tldiagram.createDiagram', async () => {
      logger.debug('extension', 'Command: createDiagram')
      if (!client) {
        vscode.window.showErrorMessage('Not connected. Run "tlDiagram: Connect with API Key" first.')
        return
      }
      const name = await vscode.window.showInputBox({
        prompt: 'Diagram name',
        placeHolder: 'e.g. System Context',
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() ? null : 'Name cannot be empty'),
      })
      if (!name) return
      try {
        logger.info('extension', 'Creating diagram', { name: name.trim() })
        await client.createDiagram(name.trim())
        treeProvider.refresh()
        logger.info('extension', 'Diagram created')
      } catch (e) {
        logger.error('extension', 'createDiagram failed', { error: String(e) })
        vscode.window.showErrorMessage(
          `Failed to create diagram: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }),

    vscode.commands.registerCommand('tldiagram.renameDiagram', async (item: DiagramTreeItem) => {
      logger.debug('extension', 'Command: renameDiagram', { id: item.diagram.id })
      if (!client) return
      const name = await vscode.window.showInputBox({
        prompt: 'New name',
        value: item.diagram.name,
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() ? null : 'Name cannot be empty'),
      })
      if (!name || name.trim() === item.diagram.name) return
      try {
        logger.info('extension', 'Renaming diagram', { id: item.diagram.id, from: item.diagram.name, to: name.trim() })
        await client.renameDiagram(item.diagram.id, name.trim())
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
      if (!client || !currentOrgId) return
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
        await client.deleteDiagram(currentOrgId, item.diagram.id)
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

    // Stage 3D: Export/Import stubs (handled natively)
    vscode.commands.registerCommand('tldiagram.exportDiagram', () => {
      logger.info('extension', 'Command: exportDiagram (stub)')
      vscode.window.showInformationMessage('Export coming soon.')
    }),

    vscode.commands.registerCommand('tldiagram.importDiagram', () => {
      logger.info('extension', 'Command: importDiagram (stub)')
      vscode.window.showInformationMessage('Import coming soon.')
    }),

    // Stage 3B: Add object from tree view to active diagram
    vscode.commands.registerCommand('tldiagram.addElementToDiagram', (item: ElementTreeItem) => {
      logger.info('extension', 'Command: addElementToDiagram', { elementId: item.element.id, name: item.element.name })
      elementLibraryTreeProvider.addElementToDiagram(item.element)
    }),

    vscode.commands.registerCommand('tldiagram.goToDiagram', async (args?: { elementId?: number }) => {
      logger.info('extension', 'Command: goToDiagram', args)
      if (!args || typeof args.elementId !== 'number') {
        vscode.window.showErrorMessage('No element selected.')
        return
      }
      if (!client) {
        vscode.window.showErrorMessage('Not connected. Run "tlDiagram: Connect with API Key" first.')
        return
      }

      try {
        const placements = await client.listElementPlacements(args.elementId)
        if (placements.length === 0) {
          vscode.window.showInformationMessage('This element is not in any diagrams.')
          return
        }

        let selectedDiagramId: string | undefined = undefined;
        let selectedDiagramName: string | undefined = undefined;

        if (placements.length === 1) {
          selectedDiagramId = String(placements[0].view_id)
          selectedDiagramName = placements[0].view_name
        } else {
          // Show quick pick
          const items = placements.map(d => ({ label: d.view_name, description: String(d.view_id), diagramId: String(d.view_id) }))
          const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select a diagram to open' })
          if (!selected) return
          selectedDiagramId = selected.diagramId
          selectedDiagramName = selected.label
        }

        if (selectedDiagramId && selectedDiagramName) {
           await webviewManager.openDiagram({ diagram: { id: Number(selectedDiagramId), name: selectedDiagramName } } as DiagramTreeItem)
           
           // Wait a moment and then send focus-element
           setTimeout(() => {
              webviewManager.postMessageToDiagram(Number(selectedDiagramId!), { type: 'focus-element', elementId: args.elementId! })
           }, 1000)
        }
      } catch (e) {
        logger.error('extension', 'goToDiagram failed', { error: String(e) })
        vscode.window.showErrorMessage(`Failed to go to diagram: ${e instanceof Error ? e.message : String(e)}`)
      }
    }),

    vscode.commands.registerCommand('tldiagram.analyzeFolder', async (uri?: vscode.Uri) => {
      logger.info('extension', 'Command: analyzeFolder', { uri: uri?.fsPath })
      if (!client) {
        vscode.window.showErrorMessage('Not connected. Run "tlDiagram: Connect / Login" first.')
        return
      }
      
      const targetPath = uri?.fsPath || vscode.workspace.workspaceFolders?.[0].uri.fsPath
      if (!targetPath) {
        vscode.window.showErrorMessage('No folder selected to analyze.')
        return
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `tlDiagram: Analyzing workspace...`, cancellable: false },
        async () => {
          try {
            await execAsync(`tld --version`)
          } catch (err) {
            vscode.window.showErrorMessage('The "tld" CLI was not found on your PATH. Please install standard tld release to use this feature.')
            return
          }

          try {
            // 1. Run tld init
            try {
               await execAsync(`tld init`, { cwd: targetPath })
            } catch (initErr: any) {
               if (!initErr.message?.includes('already exists')) {
                  throw new Error(`Init failed: ${initErr.message}`)
               }
            }

            // 2. Run tld analyze
            await execAsync(`tld analyze .`, { cwd: targetPath })

            // 3. Apply changes automatically
            await execAsync(`tld apply --force`, { cwd: targetPath })

            vscode.window.showInformationMessage(`Successfully analyzed and synced code models!`)
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
