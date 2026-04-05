import * as vscode from 'vscode'
import { logger } from './logger'
import { AuthManager } from './auth/AuthManager'
import { AuthUriHandler } from './auth/AuthUriHandler'
import * as crypto from 'crypto'
import { ExtensionApiClient } from './api/ExtensionApiClient'
import { DiagramTreeProvider } from './tree/DiagramTreeProvider'
import { ObjectLibraryTreeProvider } from './tree/ObjectLibraryTreeProvider'
import { DiagramObjectTreeProvider } from './tree/DiagramObjectTreeProvider'
import { WebviewManager } from './webview/WebviewManager'
import { indexFolder } from './lsp/FolderIndexer'
import { buildDiagramFromSymbols } from './lsp/DiagramAutoBuilder'
import type { DiagramTreeItem } from './tree/DiagramTreeItem'
import type { ObjectTreeItem } from './tree/ObjectTreeItem'

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

  const diagramObjectTreeProvider = new DiagramObjectTreeProvider()
  webviewManager.setDiagramObjectTreeProvider(diagramObjectTreeProvider)

  const objectLibraryTreeProvider = new ObjectLibraryTreeProvider(
    undefined,
    webviewManager,
  )

  // Always register so VS Code renders the view container immediately
  const treeView = vscode.window.createTreeView('tldiagram.diagramTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  })
  const objectLibraryView = vscode.window.createTreeView('tldiagram.objectLibrary', {
    treeDataProvider: objectLibraryTreeProvider,
    showCollapseAll: false,
  })
  const diagramObjectsView = vscode.window.createTreeView('tldiagram.diagramObjects', {
    treeDataProvider: diagramObjectTreeProvider,
    showCollapseAll: false,
  })

  context.subscriptions.push(treeView, objectLibraryView, diagramObjectsView)

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
      objectLibraryTreeProvider.updateClient(client)
      await vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', true)
      treeProvider.refresh()
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
                objectLibraryTreeProvider.updateClient(client)
                await vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', true)
                treeProvider.refresh()
                logger.info('extension', 'Login successful', { username: user.username, orgName: user.orgName })
                vscode.window.showInformationMessage(
                  `Connected to tlDiagram as ${user.username} (${user.orgName})`,
                )
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
      objectLibraryTreeProvider.refresh()
      await vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', false)
      vscode.window.showInformationMessage('Disconnected from tlDiagram.')
      logger.info('extension', 'Logout complete')
    }),

    vscode.commands.registerCommand('tldiagram.refresh', () => {
      logger.debug('extension', 'Command: refresh')
      treeProvider.refresh()
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
      const url = `${serverUrl}/app/diagrams/${item.diagram.id}`
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
    vscode.commands.registerCommand('tldiagram.addObjectToDiagram', (item: ObjectTreeItem) => {
      logger.info('extension', 'Command: addObjectToDiagram', { objectId: item.object.id, name: item.object.name })
      objectLibraryTreeProvider.addObjectToDiagram(item.object)
    }),

    // Stage 3C: Focus object on canvas
    vscode.commands.registerCommand('tldiagram.focusObject', (objectId: number) => {
      logger.debug('extension', 'Command: focusObject', { objectId })
      diagramObjectTreeProvider.focusObject(objectId)
    }),

    // Stage 2: Create diagram from folder
    vscode.commands.registerCommand('tldiagram.createDiagramFromFolder', async (uri: vscode.Uri) => {
      logger.info('extension', 'Command: createDiagramFromFolder', { path: uri.fsPath })
      if (!client) {
        vscode.window.showErrorMessage('Not connected. Run "tlDiagram: Connect with API Key" first.')
        return
      }

      const folderName = uri.fsPath.split('/').pop() ?? 'New Diagram'

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Creating diagram from "${folderName}"…`,
          cancellable: true,
        },
        async (progress, token) => {
          try {
            // Phase 1: index symbols
            logger.info('extension', 'createDiagramFromFolder: indexing', { folder: uri.fsPath })
            progress.report({ message: 'Indexing symbols…' })
            const symbols = await indexFolder(uri, token, (done, total) => {
              progress.report({ message: `Indexing… ${done}/${total} files` })
            })

            if (token.isCancellationRequested) {
              logger.info('extension', 'createDiagramFromFolder: cancelled during indexing')
              return
            }
            if (symbols.length === 0) {
              logger.warn('extension', 'createDiagramFromFolder: no symbols found', { folder: uri.fsPath })
              vscode.window.showWarningMessage('No indexable symbols found in this folder.')
              return
            }

            logger.info('extension', 'createDiagramFromFolder: indexing complete', { symbolCount: symbols.length })

            // Phase 2: create diagram + objects
            progress.report({ message: `Creating ${symbols.length} objects…` })
            const orgId = currentOrgId ?? ''
            const diagramId = await buildDiagramFromSymbols(
              client!,
              folderName,
              symbols,
              orgId,
              token,
              (done, total) => {
                logger.trace('extension', 'createDiagramFromFolder: objects progress', { done, total })
                progress.report({ message: `Creating objects… ${done}/${total}` })
              },
            )

            logger.info('extension', 'createDiagramFromFolder: diagram built', { diagramId })
            treeProvider.refresh()

            // Open the new diagram
            const diagrams = await client!.listDiagrams()
            const newDiagram = diagrams.find((d) => d.id === diagramId)
            if (newDiagram) {
              const { DiagramTreeItem } = await import('./tree/DiagramTreeItem')
              await webviewManager.openDiagram(new DiagramTreeItem(newDiagram, 0))
            }
          } catch (e) {
            if (e instanceof vscode.CancellationError) {
              logger.info('extension', 'createDiagramFromFolder: cancelled by user')
              return
            }
            logger.error('extension', 'createDiagramFromFolder failed', { error: String(e) })
            vscode.window.showErrorMessage(
              `Failed to create diagram: ${e instanceof Error ? e.message : String(e)}`,
            )
          }
        },
      )
    }),
  )

  logger.info('extension', 'Activation complete')
}

export function deactivate(): void {
  logger.info('extension', 'Deactivating')
}
