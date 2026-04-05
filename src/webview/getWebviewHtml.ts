import * as vscode from 'vscode'
import * as crypto from 'crypto'

function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex')
}

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  apiKey: string,
  serverUrl: string,
  diagramId: number,
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets', 'index.js'),
  )
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets', 'index.css'),
  )
  const nonce = generateNonce()
  const safeServerUrl = JSON.stringify(serverUrl)
  const safeApiKey = JSON.stringify(apiKey)
  const safeDiagramId = JSON.stringify(diagramId)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'nonce-${nonce}';
    style-src ${webview.cspSource} 'unsafe-inline';
    img-src ${webview.cspSource} https://tldiagram.com https: data: blob:;
    font-src ${webview.cspSource} https://tldiagram.com data:;
    connect-src ${serverUrl} ${serverUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')};
  ">
  <link rel="stylesheet" href="${styleUri}">
  <title>tlDiagram</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__TLD_API_KEY__ = ${safeApiKey};
    window.__TLD_SERVER_URL__ = ${safeServerUrl};
    window.__TLD_DIAGRAM_ID__ = ${safeDiagramId};
    window.__TLD_VSCODE__ = true;
    window.__TLD_VSCODE_API__ = acquireVsCodeApi();
  </script>
  <script nonce="${nonce}" src="${scriptUri}" type="module"></script>
</body>
</html>`
}
