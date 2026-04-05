# tlDiagram for VS Code

Browse and edit [tlDiagram](https://tldiagram.com) architecture diagrams without leaving VS Code. Open diagrams in a full webview panel, navigate your diagram hierarchy in the sidebar, and link diagram objects directly to workspace source files via the LSP.

---

## Features

### Diagram editor in a webview panel
Open any diagram from the sidebar tree — the full React canvas loads inside VS Code. The panel stays alive when you switch tabs (`retainContextWhenHidden`), so your canvas position and selection are preserved.

The webview build strips web-only chrome:
- No top menu bar (replaced by native VS Code UI)
- No Import / Export / Share buttons in the floating menu (registered as VS Code commands instead)
- No Object Library or Diagram Explorer side panels (replaced by native tree views)

### Native sidebar tree views
Three views in the **tlDiagram** activity bar panel:

| View | What it shows |
|---|---|
| **Diagrams** | Full diagram hierarchy; create, rename, delete, open in browser |
| **Object Library** | Reusable objects grouped by type; "Add to Diagram" places them on the canvas |
| **Diagram Objects** | Objects on the currently open diagram; click to focus that node on the canvas |

### Workspace source linking
Select any diagram object → the source section shows a workspace file picker backed by your LSP. Pick a file, pick a symbol — the object stores a `filePath#{"name":…,"startLine":…}` anchor. Click **Open in Editor** to jump to the definition.

This replaces the GitHub-based source linker used in the web app. The link format is identical so objects linked in VS Code work on the web too.

### Create diagram from folder
Right-click any folder in the Explorer → **Create tlDiagram from Folder**. The extension:
1. Walks all source files under the folder with LSP's `executeDocumentSymbolProvider`
2. Filters to top-level Functions, Classes, Interfaces, Modules, Structs
3. Creates a new diagram and places each symbol as a grid-layout node pre-linked to its source
4. Opens the result in a webview panel

Progress is shown in a cancellable notification. Cancelling mid-flight deletes the partial diagram.

### Logging
All extension activity is written to the **tlDiagram** output channel. Level is controlled by `tldiagram.logLevel`.

---

## Getting started

1. Install the extension
2. Open the **tlDiagram** panel in the activity bar
3. Run **tlDiagram: Connect with API Key** — paste a `tld_…` key from [tldiagram.com/settings/api-keys](https://tldiagram.com/settings/api-keys)
4. Your diagrams appear in the **Diagrams** tree; click any to open the canvas

---

## Commands

| Command | Description |
|---|---|
| `tlDiagram: Connect with API Key` | Authenticate with a `tld_…` API key |
| `tlDiagram: Disconnect` | Clear stored credentials |
| `tlDiagram: Refresh Diagrams` | Re-fetch diagram list |
| `tlDiagram: New Diagram` | Create a blank diagram |
| `tlDiagram: Show Logs` | Open the tlDiagram output channel |
| `tlDiagram: Export Diagram` | _(coming soon)_ |
| `tlDiagram: Import Diagram` | _(coming soon)_ |
| `Create tlDiagram from Folder` | Right-click a folder in Explorer to auto-create a diagram from its symbols |

Inline context-menu commands on diagram tree items: **Open Diagram**, **Open in Browser**, **Rename Diagram**, **Delete Diagram**.

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `tldiagram.serverUrl` | `https://tldiagram.com` | Override for self-hosted instances. Trailing slash is stripped automatically. |
| `tldiagram.logLevel` | `info` | Output channel verbosity: `off` / `error` / `warn` / `info` / `debug` / `trace` |

### Log levels

| Level | What you see |
|---|---|
| `error` | Auth failures, API errors, build failures |
| `warn` | No workspace root, missing active panel, empty symbol results |
| `info` | Command invocations, diagram lifecycle, indexing summary |
| `debug` | API call details, batch progress, tree view refreshes, panel state changes |
| `trace` | Every webview↔extension message, every object created during auto-build |

Set `tldiagram.logLevel` to `debug` or `trace` and run **tlDiagram: Show Logs** when reporting issues.

---

## Requirements

- VS Code 1.85+
- A tlDiagram account and API key
- The webview bundle (`out/webview/`) must be present — run `npm run compile` after cloning

---

## Self-hosted instances

Set `tldiagram.serverUrl` to your server's base URL (e.g. `https://diag.example.com`). The extension strips trailing slashes; the API client appends `/api`.
