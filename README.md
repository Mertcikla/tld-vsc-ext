# tlDiagram for VS Code

Browse and edit [tlDiagram](https://tldiagram.com) architecture diagrams without leaving VS Code. The extension opens diagrams in a retained webview panel, exposes your diagram hierarchy and reusable objects in native sidebar views, and lets you link diagram objects to workspace files and symbols from inside the editor.

This repository contains the VS Code extension host. The React webview is built from the sibling `../frontend` workspace and emitted into `out/webview/`.

## Features

### Diagram editor in a webview panel
Open any diagram from the Diagrams tree and the full React canvas loads inside VS Code. The panel uses `retainContextWhenHidden`, so selection and canvas state are preserved when you switch tabs.

The VS Code build trims web-only chrome and relies on native commands and tree views for the extension-specific experience.

### Native sidebar tree views
The extension contributes two views in the **tlDiagram** activity bar container:

| View | What it shows |
|---|---|
| **Diagrams** | Diagram hierarchy, including parent/child relationships, with create, rename, delete, open, and open-in-browser actions |
| **Object Library** | Reusable objects grouped by type, with an **Add to Diagram** action that places the object into the active diagram |

### Workspace source linking
Inside the webview, the source picker can browse workspace files and ask VS Code for symbols in the selected file. The selected link is stored in the same shape the web app uses, so links work in both environments.

Clicking **Open in Editor** jumps to the linked file and line.

### Authentication
Use the login flow to connect your tlDiagram account. Credentials are stored securely in VS Code SecretStorage and reused on startup when present.

### Logging
All extension activity is written to the **tlDiagram** output channel. The verbosity is controlled by `tldiagram.logLevel`.

## Commands

| Command | Where it appears | Description |
|---|---|---|
| `tlDiagram: Connect / Login` | Command palette | Start the browser-based tlDiagram login flow |
| `tlDiagram: Disconnect` | Command palette | Clear stored credentials |
| `tlDiagram: Refresh Diagrams` | Command palette, tree toolbar | Re-fetch diagrams and refresh the object library |
| `tlDiagram: New Diagram` | Command palette, tree toolbar | Create a blank diagram |
| `Open Diagram` | Diagram item context menu | Open the selected diagram in the webview panel |
| `Open in Browser` | Diagram item context menu | Open the selected diagram on tldiagram.com |
| `Rename Diagram` | Diagram item context menu | Rename the selected diagram |
| `Delete Diagram` | Diagram item context menu | Delete the selected diagram |
| `Add to Diagram` | Object Library item context menu | Place the selected object into the active diagram |
| `tlDiagram: Show Logs` | Command palette | Open the tlDiagram output channel |
| `tlDiagram: Export Diagram` | Command palette | Stubbed for future work |
| `tlDiagram: Import Diagram` | Command palette | Stubbed for future work |


## Requirements

- VS Code 1.85+
- A tlDiagram account
- The extension and webview bundles must be built before loading from source
