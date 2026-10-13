import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs'
import type { DataSource } from '../../src/datasource/DataSource'

type PostedWebviewMessage = {
  diagramId: number
  message: {
    type?: string
    elementId?: number
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function eventually<T>(
  label: string,
  fn: () => Promise<T | undefined> | T | undefined,
  timeoutMs = 30000,
): Promise<T> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn()
      if (value !== undefined) return value
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  if (lastError) {
    throw new Error(`${label} timed out; last error: ${String(lastError)}`)
  }
  throw new Error(`${label} timed out`)
}

async function getAlphaJumpCodeLens(uri: vscode.Uri): Promise<vscode.CodeLens> {
  const lenses = await eventually('CodeLens provider', async () => {
    const result = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      uri,
      20,
    )
    const matching = (result ?? []).filter((lens) => lens.command?.command === 'tldiagram.goToDiagram')
    return matching.length > 0 ? matching : undefined
  })

  const lens = lenses.find((item) => item.command?.title?.includes('alphaJump')) ?? lenses[0]
  assert.ok(lens.command, 'expected tlDiagram CodeLens to include a command')
  return lens
}

async function runSourceLinkJumpTest(workspaceRoot: string): Promise<void> {
  const sampleUri = vscode.Uri.file(path.join(workspaceRoot, 'src', 'sample.ts'))
  const sampleDocument = await vscode.workspace.openTextDocument(sampleUri)
  await vscode.window.showTextDocument(sampleDocument)
  await eventually('TypeScript document symbols', async () => {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      sampleUri,
    )
    return symbols?.some((symbol) => symbol.name === 'alphaJump') ? true : undefined
  })

  const lens = await getAlphaJumpCodeLens(sampleUri)
  await vscode.commands.executeCommand(lens.command!.command, ...(lens.command!.arguments ?? []))
  await eventually<PostedWebviewMessage>('focused diagram webview before source-link jump', async () => {
    const value = await vscode.commands.executeCommand<PostedWebviewMessage | undefined>(
      'tldiagram.test.getLastPostedWebviewMessage',
    )
    if (value?.message?.type === 'focus-element' && typeof value.message.elementId === 'number') {
      return value
    }
    return undefined
  })
  await sleep(3000)

  await vscode.commands.executeCommand('tldiagram.test.dispatchWebviewMessage', {
    type: 'open-file',
    filePath: 'src/sample.ts',
    startLine: 99,
    symbolName: 'alphaJump',
    symbolKind: 'Function',
  })

  await eventually('source editor focused at alphaJump', () => {
    const editor = vscode.window.activeTextEditor
    return editor && path.normalize(editor.document.uri.fsPath) === path.join(workspaceRoot, 'src', 'sample.ts')
      && editor.selection.active.line === 0 ? true : undefined
  })
}

async function runCodeLensJumpTest(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  assert.ok(editor, 'expected sample editor to be active before checking CodeLens')

  const lens = await getAlphaJumpCodeLens(editor.document.uri)
  assert.ok(lens.command, 'expected tlDiagram CodeLens to include a command')
  await vscode.commands.executeCommand(lens.command.command, ...(lens.command.arguments ?? []))

  const posted = await eventually<PostedWebviewMessage>('focus-element webview message', async () => {
    const value = await vscode.commands.executeCommand<PostedWebviewMessage | undefined>(
      'tldiagram.test.getLastPostedWebviewMessage',
    )
    if (value?.message?.type === 'focus-element' && typeof value.message.elementId === 'number') {
      return value
    }
    return undefined
  })

  assert.ok(posted.diagramId > 0, 'expected a real diagram id')
  assert.ok(posted.message.elementId && posted.message.elementId > 0, 'expected focus-element to target a real element id')
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.all.find((item) => item.packageJSON?.name === 'tldiagram')
  assert.ok(extension, 'expected tlDiagram extension to be installed in the test host')
  await extension.activate()

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  assert.ok(workspaceRoot, 'expected the e2e fixture workspace to be open')

  await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  const mode = await vscode.commands.executeCommand<string | undefined>('tldiagram.test.waitForReady')
  assert.strictEqual(mode, 'local', 'expected extension to connect to local tld mode')

  const localState = () => vscode.commands.executeCommand<{
    baseUrl: string; status: { active: boolean }; diagrams: unknown[]; elements: unknown[]
  }>('tldiagram.test.getLocalState')
  const before = await localState()
  assert.ok(before?.status.active, 'expected automatic repository watching')
  assert.ok(before.diagrams.length > 0 && before.elements.length > 0, 'expected indexed diagrams and elements')
  await vscode.commands.executeCommand('tldiagram.stopWatch')
  const stopped = await localState()
  assert.strictEqual(stopped?.status.active, false, 'expected repository watcher to stop')
  assert.strictEqual(stopped?.baseUrl, before.baseUrl, 'stopping watch must retain the API server')
  assert.ok(stopped!.diagrams.length > 0, 'diagrams must remain accessible after stopping watch')
  await vscode.commands.executeCommand('tldiagram.startWatch')
  assert.strictEqual((await localState())?.status.active, true, 'expected repository watcher to restart')

  const dataSource = await vscode.commands.executeCommand<DataSource>('tldiagram.test.getDataSource')
  assert.ok(dataSource)
  const created = await dataSource.createDiagram('Compatibility test')
  assert.ok(created.id > 0, 'expected diagram creation on an existing workspace')
  await dataSource.renameDiagram(created.id, 'Compatibility renamed')
  assert.ok((await dataSource.listDiagrams()).some((view) => view.id === created.id && view.name === 'Compatibility renamed'))
  assert.strictEqual(await dataSource.getViewMarkdown(created.id), null, 'new diagrams have no linked markdown')
  const markdown = await fetch(`${before.baseUrl}/api/diag.v1.WorkspaceService/CreateViewMarkdown`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ viewId: created.id, fileName: 'compatibility.md', initialContent: '# Initial note' }),
  })
  assert.ok(markdown.ok, `could not create markdown: ${await markdown.text()}`)
  await dataSource.saveViewMarkdown(created.id, '# Compatibility note')
  assert.strictEqual((await dataSource.getViewMarkdown(created.id))?.content, '# Compatibility note')
  await dataSource.deleteDiagram(created.id)
  assert.ok(!(await dataSource.listDiagrams()).some((view) => view.id === created.id), 'expected diagram deletion')

  const updated = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { subscription.dispose(); reject(new Error('Live file changes timed out')) }, 90000)
    const subscription = dataSource.onWatchEvent((event) => {
      if (event.type === 'representation.updated' && event.data?.diffs?.some((diff: { name: string }) => diff.name === 'src/sample.ts')) {
        clearTimeout(timeout)
        subscription.dispose()
        resolve()
      }
    })
  })
  fs.appendFileSync(path.join(workspaceRoot, 'src', 'sample.ts'), '\nexport const compatibilityChange = 1\n')
  await updated
  const changeCommand = await vscode.commands.executeCommand<vscode.Command>('tldiagram.test.getWatchChangeCommand')
  assert.strictEqual(changeCommand?.command, 'tldiagram.openRepositoryChange', 'changed file must have a canvas navigation command')
  const target = changeCommand!.arguments![0] as { repositoryId: string; filePath: string }
  assert.strictEqual(target.filePath, 'src/sample.ts')
  await vscode.commands.executeCommand(changeCommand!.command, ...changeCommand!.arguments!)
  // Host-only CI jobs do not build the shared frontend. Verify real webview
  // loading whenever its bundle is present (including local packaged builds).
  if (fs.existsSync(path.join(extension.extensionPath, 'out', 'webview', 'assets', 'index.js'))) {
    await eventually('repository change webview loads the live map', async () => {
      const state = await vscode.commands.executeCommand<{ ready: boolean; loaded: boolean; active: boolean; target: { filePath: string } }>(
        'tldiagram.test.getRepositoryChangeState', target.repositoryId,
      )
      return state?.ready && state.loaded && state.active && state.target.filePath === target.filePath ? true : undefined
    }, 45000)
  } else {
    console.log('E2E: webview bundle absent; checking the native change navigation command only')
  }
  // Clicking again should reveal the existing repository tab and focus again.
  await vscode.commands.executeCommand(changeCommand!.command, ...changeCommand!.arguments!)
  console.log('E2E: Watch Changes opens the repository change canvas')
  console.log('E2E: live file changes received')
  await vscode.commands.executeCommand('tldiagram.analyzeFolder', vscode.Uri.file(workspaceRoot))
  assert.strictEqual(dataSource.getWatchStatus()?.active, true, 'indexing once must resume an active watcher')

  console.log('E2E: indexing and diagram CRUD passed')
  await runSourceLinkJumpTest(workspaceRoot)
  await runCodeLensJumpTest()
  console.log('E2E: source navigation and CodeLens passed')
}
