# AGENTS.md

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

# Rebuild only the webview (run after core changes)
npm run compile:webview

# Package as .vsix (runs full compile first)
npm run package

# Unit tests / end-to-end tests
npm test
npm run test:e2e
```

`npm run test:e2e` compiles the extension + test suite, creates a temporary git
fixture workspace, seeds it with `tld init` + `tld analyze .`, then launches a
real VS Code via `@vscode/test-electron`. Set `TLD_CLI_PATH` to test against a
specific `tld` binary (otherwise it is resolved from `PATH`).

**Debugging in VS Code (F5).** `.vscode/launch.json` scopes the debugger's
`outFiles` to `out/extension.js` only. Do not widen it to `out/**/*.js`: the
webview build emits hundreds of chunks + source maps under `out/webview/`, and
js-debug needs longer than the extension host's 10s startup budget to scan them,
which surfaces as *"Extension host did not start in 10 seconds..."*. Use
**Run Extension (no debug)** if you hit it anyway, and clear stale breakpoints.

## Architecture

This is a VS Code extension that surfaces tlDiagram inside the editor. It has two runtime contexts:

### Extension host (`src/`)

Runs in Node.js inside VS Code. Entry point is `src/extension.ts` (`activate` / `deactivate`). The extension is bundled by esbuild into `out/extension.js`. Only local CLI mode is supported — cloud/auth/billing code has been removed.

**Mode, CLI & data source**
- **`src/modes/ModeManager.ts`** — resolves the `tld` CLI via `CLIManager`, constructs a `LocalDataSource`, sets the `tldiagram.mode` / `tldiagram.authenticated` context keys.
- **`src/cli/CLIManager.ts`** — detects the `tld` binary from `tldiagram.cliPath`, `PATH`, then well-known installer locations (`~/.tld/bin`, `~/.local/bin`, `~/bin`, `/usr/local/bin`, Homebrew). `getVersion()` runs `tld version`.
- **`src/datasource/DataSource.ts`** — interface used by all consumers (list/create/rename/delete diagrams, list/create elements, placements, view markdown, watch lifecycle, watch events).
- **`src/datasource/LocalDataSource.ts`** — spawns `tld watch <workspaceRoot> --host <h> --port <p>`, waits for `GET /api/ready`, then talks ConnectRPC. Handles transient restarts (kills + respawns `tld watch`) and reports unexpected watch exits. `startWatch`/`stopWatch` are delegated to the CLI.
- **`src/api/ExtensionApiClient.ts`** — ConnectRPC client wrapping `WorkspaceService` through `@buf/tldiagramcom_diagram.bufbuild_es/...`; esbuild aliases those imports to `../tld/frontend/src/gen/` so the bundle matches local proto output. Accepts `~#<anchor>` source links.

**Tree views**
- **`src/tree/DiagramTreeProvider.ts`** / **`DiagramTreeItem.ts`** — Diagrams panel. Flat list fetched once; hierarchy resolved in memory via `parent_diagram_id`. `contextValue = 'diagram'`.
- **`src/tree/ElementLibraryTreeProvider.ts`** / **`ElementTreeItem.ts`** — Element Inventory panel. Elements grouped by kind; "Add to Diagram" posts `element-placed` to the active webview. `contextValue = 'diagElement'`.

**Webview management**
- **`src/webview/WebviewManager.ts`** — one `vscode.WebviewPanel` per view (keyed by view id), `retainContextWhenHidden: true`. Wires a `MessageRouter`, `WorkspaceSymbolService`, and `MarkdownDocumentService` per panel; forwards `markdown-saved` events to the webview.
- **`src/webview/getWebviewHtml.ts`** — HTML shell. Injects `__TLD_SERVER_URL__`, `__TLD_DIAGRAM_ID__`, `__TLD_VSCODE_THEME__`, `__TLD_VSCODE__ = true`, `__TLD_VSCODE_API__ = acquireVsCodeApi()`, applies a nonce-based CSP, and maps VS Code theme colors onto tlDiagram CSS variables.
- **`src/webview/MessageRouter.ts`** — typed dispatch for `WebviewToExtensionMessage`; one handler per type, handler errors are logged not thrown.
- **`src/webview/WorkspaceSymbolService.ts`** — handles `request-workspace-files` (findFiles), `request-symbol-list-for-file` (documentSymbolProvider), `open-file` (showTextDocument, resolves symbol → line), and `request-file-content` (reads a line window).
- **`src/webview/MarkdownDocumentService.ts`** — `tldiagram-markdown:` FileSystemProvider for opening version-linked markdown notes in the editor and saving back through the API.
- **`src/webview/vscodeMessages.ts`** — local copy of the bridge message types (kept in sync with `../tld/frontend/src/types/vscode-messages.ts`).

**Source linking**
- **`src/ElementCacheService.ts`** — indexes elements by file path (`#` anchors stripped), exposes `getElementsForFile` / `getElementsForSymbol`, refreshes on `representation.updated` watch events.
- **`src/TLDiagramCodeLensProvider.ts`** — "tlDiagram: <element>" CodeLens on linked source lines.
- **`src/provider/WorkspaceSymbolProvider.ts`** — `Ctrl/Cmd+T` entries for diagram elements.
- **`src/GitContextService.ts`** — repo/branch detection for cloud-style element filtering (local mode skips it).

**Watch**
- **`src/watch/WatchService.ts`** — raw WebSocket client to the local watch server; emits `WatchEvent`s and status.
- **`src/watch/WatchDiffProvider.ts`** — `tldiagram.watchDiff` tree view of watch changes.
- **`src/watch/WatchStatusBar.ts`** — status bar item for watch state.
- **`src/watch/LspStatusNotifier.ts`** — surfaces degraded language servers.

**Logging**
- **`src/logger.ts`** — singleton `Logger` backed by a VS Code OutputChannel named "tlDiagram". Levels: `off / error / warn / info / debug / trace`, from `tldiagram.logLevel`. Call `logger.init(context)` once from `activate()`.

### Webview (`out/webview/`)

The React frontend (from `../tld/frontend`) is built with the `vscode` Vite target (`../tld/frontend/vite.vscode.config.ts`) via the `vscodeOverridesPlugin`. Output is served as local resources from `out/webview/assets/`.

**Active Vite overrides:**

| Original | VSCode override | Effect |
|---|---|---|
| `api/transport.ts` | `transport-vscode.ts` | Talks to the local CLI HTTP server from `__TLD_SERVER_URL__` |
| `config/runtime.ts` | `runtime-vscode.ts` | Reads `__TLD_SERVER_URL__`, no Capacitor |
| `components/CodePreviewPanel.tsx` | `CodePreviewPanel-vscode.tsx` | "Open in Editor" only (no CodeMirror/tree-sitter) |
| `components/GitSourceLinker.tsx` | `LocalSourceLinker.tsx` | Workspace file + LSP symbol picker (no GitHub) |

`ElementInventory` and `ViewExplorer` are **not** overridden — the in-webview panels render as in the web app, in addition to the native tree views.

`ViewFloatingMenu` is not overridden; it detects `window.__TLD_VSCODE__` at runtime and hides the Import / Export / Share extras section.

**Bridge (`../tld/frontend/src/lib/vscodeBridge.ts`)** — typed wrapper around `acquireVsCodeApi()`. Message types live in `../tld/frontend/src/types/vscode-messages.ts`.

```
WebviewToExtensionMessage:  ready | open-file | open-markdown
                            request-workspace-files | request-symbol-list-for-file
                            diagram-loaded | request-file-content

ExtensionToWebviewMessage:  workspace-symbols | workspace-files | element-placed
                            focus-element | diagnostics-update | file-content
                            markdown-saved
```

Request/response pairs use a `requestId` string for async matching over the one-way channel.

## Key relationships

- The extension **shares protobuf generated types** with core UI — `esbuild.mjs` aliases `@buf/.../workspace_service_pb` to `../tld/frontend/src/gen/`. If proto definitions change, run `cd .. && make dev-proto` and rebuild.
- The extension also imports `../tld/frontend/src/types/vscode-messages.ts` and `../tld/frontend/src/types/index.ts` directly. These cross the `rootDir` boundary so `tsc --noEmit` can report `TS6059`; esbuild resolves them correctly at build time.
- The `tldiagram.authenticated` context key gates toolbar/context-menu items; `tldiagram.mode` gates watch views (`when: tldiagram.mode == local`).
- `vscode` is `external` in esbuild and provided by the runtime.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `tldiagram.mode` | `local` | Connection mode (local CLI only) |
| `tldiagram.cliPath` | `""` | Custom `tld` binary path (empty = auto-detect) |
| `tldiagram.autoStartWatch` | `true` | Start `tld watch` on workspaces with `.tld/` |
| `tldiagram.watch.host` | `127.0.0.1` | Local watch server host |
| `tldiagram.watch.port` | `0` | Local watch server port (`0` = auto-select) |
| `tldiagram.uiColorMode` | `vscodeTheme` | `vscodeTheme` or `palette` |
| `tldiagram.paletteAccent` / `paletteCanvas` / `paletteElement` | hex | Palette used when `uiColorMode = palette` |
| `tldiagram.logLevel` | `info` | Output channel verbosity |

## Debugging

1. Set `tldiagram.logLevel` to `debug` or `trace`
2. Run **tlDiagram: Show Logs** to open the output channel
3. Reproduce — message routing, API calls, and LSP interactions are logged

`[component]` identifies the source: `extension` · `ModeManager` · `CLIManager` · `LocalDataSource` · `WebviewManager` · `MessageRouter` · `WorkspaceSymbolService` · `MarkdownDocumentService` · `ExtensionApiClient` · `ElementCacheService` · `WatchService` · `WatchDiffProvider` · `WatchStatusBar` · `LspStatusNotifier` · `Logger`
