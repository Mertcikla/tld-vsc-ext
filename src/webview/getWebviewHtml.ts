import * as vscode from 'vscode'
import * as crypto from 'crypto'

function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex')
}

function getHexSetting(config: vscode.WorkspaceConfiguration, key: string, fallback: string): string {
  const value = config.get<string>(key, fallback)
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
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
  const safeDiagramId = JSON.stringify(diagramId)
  const config = vscode.workspace.getConfiguration('tldiagram')
  const themePayload = {
    mode: config.get<'vscodeTheme' | 'palette'>('uiColorMode', 'vscodeTheme'),
    palette: {
      accent: getHexSetting(config, 'paletteAccent', '#63b3ed'),
      canvas: getHexSetting(config, 'paletteCanvas', '#10151f'),
      element: getHexSetting(config, 'paletteElement', '#1f2937'),
    },
  }
  const safeThemePayload = JSON.stringify(themePayload)

  const wsUrl = serverUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')

  const connectSrc = `${serverUrl} ${wsUrl}`
  const imgFontSrc = `${webview.cspSource} ${serverUrl} data: blob:`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'nonce-${nonce}';
    style-src ${webview.cspSource} 'unsafe-inline';
    img-src ${imgFontSrc};
    font-src ${imgFontSrc};
    connect-src ${connectSrc};
  ">
  <link rel="stylesheet" href="${styleUri}">
  <title>tlDiagram</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__TLD_SERVER_URL__ = ${safeServerUrl};
    window.__TLD_DIAGRAM_ID__ = ${safeDiagramId};
    window.__TLD_VSCODE_THEME__ = ${safeThemePayload};
    window.__TLD_VSCODE__ = true;
    window.__TLD_VSCODE_API__ = acquireVsCodeApi();
    (() => {
      const theme = window.__TLD_VSCODE_THEME__;
      const palette = theme?.palette ?? {};
      const root = document.documentElement;
      const themeRoot = document.body ?? root;
      const isHex = (value) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim());
      const expandHex = (value) => {
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
        if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
          return '#' + trimmed.slice(1).split('').map((char) => char + char).join('');
        }
        return undefined;
      };
      const readThemeHex = (name, fallback) => expandHex(getComputedStyle(themeRoot).getPropertyValue(name)) ?? fallback;
      const colors = theme?.mode === 'palette'
        ? palette
        : {
          accent: readThemeHex('--vscode-button-background', palette.accent),
          canvas: readThemeHex('--vscode-editor-background', palette.canvas),
          element: readThemeHex('--vscode-sideBar-background', palette.element),
        };
      const toRgb = (hex) => {
        const normalized = isHex(hex) ? hex.trim().slice(1) : '63b3ed';
        return [
          parseInt(normalized.slice(0, 2), 16),
          parseInt(normalized.slice(2, 4), 16),
          parseInt(normalized.slice(4, 6), 16),
        ].join(', ');
      };
      const applyColor = (storageKey, cssVar, rgbVar, value) => {
        if (!isHex(value)) return;
        localStorage.setItem(storageKey, value);
        root.style.setProperty(cssVar, value);
        root.style.setProperty(rgbVar, toRgb(value));
      };
      applyColor('diag:accent-color', '--accent', '--accent-rgb', colors.accent);
      applyColor('diag:background-color', '--bg-main', '--bg-main-rgb', colors.canvas);
      applyColor('diag:element-color', '--bg-element', '--bg-element-rgb', colors.element);
    })();
  </script>
  <script nonce="${nonce}" src="${scriptUri}" type="module"></script>
</body>
</html>`
}
