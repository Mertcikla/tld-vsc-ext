import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

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

  const editor = vscode.window.activeTextEditor
  assert.ok(editor, 'expected a source editor to be active')
  await sleep(3000)
  assert.strictEqual(path.normalize(editor.document.uri.fsPath), path.join(workspaceRoot, 'src', 'sample.ts'))
  assert.strictEqual(editor.selection.active.line, 0, 'expected source jump to resolve the alphaJump symbol line')
}

async function runCodeLensJumpTest(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  assert.ok(editor, 'expected sample editor to be active before checking CodeLens')

  const lens = await getAlphaJumpCodeLens(editor.document.uri)
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

  await runSourceLinkJumpTest(workspaceRoot)
  await runCodeLensJumpTest()
}
