import * as vscode from 'vscode'
import { AuthManager } from './auth/AuthManager'
import { ExtensionApiClient } from './api/ExtensionApiClient'
import { DiagramTreeProvider } from './tree/DiagramTreeProvider'
import { WebviewManager } from './webview/WebviewManager'
import type { DiagramTreeItem } from './tree/DiagramTreeItem'

function getServerUrl(): string {
  return vscode.workspace
    .getConfiguration('tldiagram')
    .get<string>('serverUrl', 'https://tldiagram.com')
    .replace(/\/$/, '')
}

export function activate(context: vscode.ExtensionContext): void {
  const serverUrl = getServerUrl()
  const authManager = new AuthManager(context.secrets, serverUrl)

  let client: ExtensionApiClient | undefined
  let currentOrgId: string | undefined

  // Placeholder client so TypeScript is happy; swapped out before use
  const treeProvider = new DiagramTreeProvider(undefined as unknown as ExtensionApiClient)
  const webviewManager = new WebviewManager(context.extensionUri, authManager, serverUrl)

  // Always register so VS Code renders the view container immediately
  const treeView = vscode.window.createTreeView('tldiagram.diagramTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  })
  context.subscriptions.push(treeView)

  // Bootstrap: if a key is already stored, connect silently
  void authManager.getKey().then(async (key) => {
    if (!key) return
    try {
      const newClient = new ExtensionApiClient(serverUrl, key)
      const user = await newClient.getMe()
      client = newClient
      currentOrgId = user.orgId
      treeProvider.updateClient(client)
      await vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', true)
      treeProvider.refresh()
    } catch (e) {
      console.error('[tldiagram] bootstrap getMe failed:', e)
      await authManager.clearKey()
    }
  })

  // ── Commands ──────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('tldiagram.login', async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: 'Paste your tlDiagram API key',
        placeHolder: 'tld_…',
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) =>
          v.startsWith('tld_')
            ? null
            : 'Key must start with "tld_". Create one at tldiagram.com/settings/api-keys',
      })
      if (!apiKey) return

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Connecting to tlDiagram…' },
        async () => {
          try {
            const candidateClient = new ExtensionApiClient(serverUrl, apiKey)
            const user = await candidateClient.getMe()
            await authManager.storeKey(apiKey)
            client = candidateClient
            currentOrgId = user.orgId
            treeProvider.updateClient(client)
            await vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', true)
            treeProvider.refresh()
            vscode.window.showInformationMessage(
              `Connected to tlDiagram as ${user.username} (${user.orgName})`,
            )
          } catch (e) {
            console.error('[tldiagram] login failed:', e)
            vscode.window.showErrorMessage(
              `Invalid or expired API key: ${e instanceof Error ? e.message : String(e)}`,
            )
          }
        },
      )
    }),

    vscode.commands.registerCommand('tldiagram.logout', async () => {
      await authManager.clearKey()
      client = undefined
      currentOrgId = undefined
      treeProvider.clear()
      await vscode.commands.executeCommand('setContext', 'tldiagram.authenticated', false)
      vscode.window.showInformationMessage('Disconnected from tlDiagram.')
    }),

    vscode.commands.registerCommand('tldiagram.refresh', () => {
      treeProvider.refresh()
    }),

    vscode.commands.registerCommand('tldiagram.openDiagram', async (item: DiagramTreeItem) => {
      await webviewManager.openDiagram(item)
    }),

    vscode.commands.registerCommand('tldiagram.createDiagram', async () => {
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
        await client.createDiagram(name.trim())
        treeProvider.refresh()
      } catch (e) {
        vscode.window.showErrorMessage(
          `Failed to create diagram: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }),

    vscode.commands.registerCommand('tldiagram.renameDiagram', async (item: DiagramTreeItem) => {
      if (!client) return
      const name = await vscode.window.showInputBox({
        prompt: 'New name',
        value: item.diagram.name,
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim() ? null : 'Name cannot be empty'),
      })
      if (!name || name.trim() === item.diagram.name) return
      try {
        await client.renameDiagram(item.diagram.id, name.trim())
        treeProvider.refresh()
      } catch (e) {
        vscode.window.showErrorMessage(
          `Failed to rename: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }),

    vscode.commands.registerCommand('tldiagram.deleteDiagram', async (item: DiagramTreeItem) => {
      if (!client || !currentOrgId) return
      const answer = await vscode.window.showWarningMessage(
        `Delete "${item.diagram.name}"? This cannot be undone.`,
        { modal: true },
        'Delete',
      )
      if (answer !== 'Delete') return
      try {
        await client.deleteDiagram(currentOrgId, item.diagram.id)
        treeProvider.refresh()
      } catch (e) {
        vscode.window.showErrorMessage(
          `Failed to delete: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }),

    vscode.commands.registerCommand('tldiagram.openInBrowser', (item: DiagramTreeItem) => {
      void vscode.env.openExternal(
        vscode.Uri.parse(`${serverUrl}/app/diagrams/${item.diagram.id}`),
      )
    }),
  )
}

export function deactivate(): void {
  // VS Code disposes subscriptions automatically
}
