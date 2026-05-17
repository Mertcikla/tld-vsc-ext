# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build commands

```bash
# Build the extension host only (TypeScript → out/extension.js via esbuild)
npm run compile:ext

# Build the webview bundle (delegates to ../tld/frontend/npm run build:vscode)
npm run compile:webview

# Build both
npm run compile

# Watch mode for extension host (fast rebuild on save)
npm run watch

# Package as .vsix (runs full compile first)
npm run package
```

There are no tests in this repository.

## Architecture

This is a VS Code extension that surfaces tlDiagram inside the editor. It has two runtime contexts:

### Extension host (`src/`)

Runs in Node.js inside VS Code. Entry point is `src/extension.ts` (`activate` / `deactivate`). The extension is bundled by esbuild into `out/extension.js`.

**Auth & API**
- **`src/auth/AuthManager.ts`** — stores/retrieves API keys via VS Code's `SecretStorage` (keychain-backed). Keys have the prefix `tld_`.
- **`src/api/ExtensionApiClient.ts`** — ConnectRPC client wrapping `WorkspaceService`. Uses Bearer token auth. Imports protobuf-generated types through `@buf/tldiagramcom_diagram.bufbuild_es/...`; esbuild aliases those imports to `../tld/frontend/src/gen/` so the extension host bundle matches local proto output.

**Tree views**
- **`src/tree/DiagramTreeProvider.ts`** — `vscode.TreeDataProvider` for the Diagrams panel. Flat list fetched once; parent/child hierarchy resolved in memory via `parent_diagram_id`.
- **`src/tree/DiagramTreeItem.ts`** — `vscode.TreeItem` wrapping a `Diagram`. `contextValue = 'diagram'` drives context-menu `when` clauses.
- **`src/tree/ObjectLibraryTreeProvider.ts`** — `vscode.TreeDataProvider` for the Object Library panel. Objects are grouped by type. Populated via `setObjects()` from `diagram-loaded` webview messages. "Add to Diagram" posts `object-placed` to the active webview.
- **`src/tree/ObjectTreeItem.ts`** — `vscode.TreeItem` wrapping a `DiagObjectData`. `contextValue = 'diagObject'`.
- **`src/tree/DiagramObjectTreeProvider.ts`** — `vscode.TreeDataProvider` for the Diagram Objects panel. Populated from `diagram-loaded` messages. Clicking an item posts `focus-object` to the webview.

**Webview management**
- **`src/webview/WebviewManager.ts`** — creates/reuses `vscode.WebviewPanel` per diagram (keyed by `diagram.id`). Sets `retainContextWhenHidden: true`. Wires up `MessageRouter` and `WorkspaceSymbolService` for each panel. Notifies `DiagramObjectTreeProvider` on panel view-state changes and disposal.
- **`src/webview/getWebviewHtml.ts`** — generates the webview HTML shell. Injects five globals: `__TLD_API_KEY__`, `__TLD_SERVER_URL__`, `__TLD_DIAGRAM_ID__`, `__TLD_VSCODE__ = true`, `__TLD_VSCODE_API__ = acquireVsCodeApi()`. Applies a strict CSP with a per-panel nonce.
- **`src/webview/MessageRouter.ts`** — typed dispatch for `WebviewToExtensionMessage` messages. Each message type maps to one registered handler. Errors in handlers are caught and logged rather than bubbling.
- **`src/webview/WorkspaceSymbolService.ts`** — handles three message types from the webview: `request-workspace-files` (findFiles), `request-symbol-list-for-file` (executeDocumentSymbolProvider), `open-file` (showTextDocument).

**LSP / auto-creation**
- **`src/lsp/symbolMapping.ts`** — `INDEXED_KINDS` set, `kindToObjectType()` mapper, source file globs.
- **`src/lsp/FolderIndexer.ts`** — walks source files in a folder via findFiles + executeDocumentSymbolProvider (batched, concurrency=5). Returns `IndexedSymbol[]`. Respects cancellation between batches.
- **`src/lsp/DiagramAutoBuilder.ts`** — given a list of `IndexedSymbol`s, creates a diagram and places objects in an 8-column grid. Batched 50 at a time. On cancellation or error, deletes the partial diagram.
- **`src/lsp/WorkspaceIndex.ts`** — singleton lazy index of the full workspace. Initialized once; re-indexes individual files on `onDidSaveTextDocument`. Intended for fast symbol lookup without per-request LSP calls.

**Logging**
- **`src/logger.ts`** — singleton `Logger` backed by a VS Code OutputChannel named "tlDiagram". Six levels: `off / error / warn / info / debug / trace`. Level is read from `tldiagram.logLevel` config and updated live on config changes. Format: `[ISO timestamp] [LEVEL] [component] message {json}`. Call `logger.init(context)` once from `activate()`.

### Webview (`out/webview/`)

The React frontend (from `../tld/frontend`) is built with a `vscode` Vite target (`../tld/frontend/vite.vscode.config.ts`) that swaps in VS Code-specific implementations via the `vscodeOverridesPlugin`. The result is served as local resources from `out/webview/assets/`.

**Active Vite overrides** (all in `../tld/frontend/vite.vscode.config.ts`):

| Original | VSCode override | Effect |
|---|---|---|
| `api/transport.ts` | `transport-vscode.ts` | Bearer token auth instead of session cookies |
| `config/runtime.ts` | `runtime-vscode.ts` | Reads `window.__TLD_SERVER_URL__`, no Capacitor |
| `lib/purchases.ts` | `purchases-vscode.ts` | No-op stub (no RevenueCat) |
| `lib/vscodeBridge.ts` | `vscodeBridge-vscode.ts` | Real `acquireVsCodeApi()` wrapper |
| `components/AuthLayout.tsx` | `AuthLayout-vscode.tsx` | No `TopMenuBar` or `EmailVerificationBanner` |
| `components/DiagramFloatingMenu.tsx` | `DiagramFloatingMenu-vscode.tsx` | No Import / Export / Share |
| `components/GitSourceLinker.tsx` | `LocalSourceLinker.tsx` | Workspace file + LSP symbol picker |
| `components/CodePreviewPanel.tsx` | `CodePreviewPanel-vscode.tsx` | "Open in Editor" button only (no CodeMirror) |
| `components/ObjectLibrary.tsx` | `ObjectLibrary-vscode.tsx` | `null` render (native tree view) |
| `components/DiagramExplorer.tsx` | `DiagramExplorer-vscode.tsx` | `null` render (native tree view) |

**Bridge (`../tld/frontend/src/lib/vscodeBridge.ts`)**

Typed wrapper around `acquireVsCodeApi()`. Web builds get a no-op stub; the VSCode build gets the real implementation. Message types are defined in `../tld/frontend/src/types/vscode-messages.ts`.

```
WebviewToExtensionMessage:  ready | open-file | request-workspace-files
                            request-symbol-list-for-file | diagram-loaded

ExtensionToWebviewMessage:  workspace-symbols | workspace-files | object-placed
                            focus-object | diagnostics-update
```

Request/response pairs use a `requestId` string for async matching over the one-way channel.

## Key relationships

- The extension **shares protobuf generated types** with core UI — `esbuild.mjs` aliases `@buf/.../workspace_service_pb` to `../tld/frontend/src/gen/`. If proto definitions change, run `cd .. && make dev-proto` and rebuild.
- `esbuild.mjs` aliases `@buf/tldiagramcom_diagram.bufbuild_es/…` to the local gen files so the extension host bundle is self-contained.
- The extension also imports `../tld/frontend/src/types/vscode-messages.ts` and `../tld/frontend/src/types/index.ts` directly. These cross the `rootDir` boundary so `tsc --noEmit` can report `TS6059` errors on them; esbuild resolves them correctly at build time.
- The `tldiagram.authenticated` VS Code context key gates toolbar/context-menu items.
- `vscode` is listed as `external` in esbuild — it is never bundled; the VS Code runtime provides it.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `tldiagram.serverUrl` | `https://tldiagram.com` | Self-hosted instance base URL |
| `tldiagram.logLevel` | `info` | Output channel verbosity: `off / error / warn / info / debug / trace` |

## Debugging

1. Set `tldiagram.logLevel` to `debug` or `trace` in VS Code settings
2. Run command **tlDiagram: Show Logs** to open the output channel
3. Reproduce the issue — all message routing, API calls, and LSP interactions are logged

The `[component]` field in each log line identifies where it came from:
`extension` · `WebviewManager` · `MessageRouter` · `WorkspaceSymbolService` · `ExtensionApiClient` · `FolderIndexer` · `DiagramAutoBuilder` · `WorkspaceIndex` · `ObjectLibraryTreeProvider` · `DiagramObjectTreeProvider` · `Logger`
