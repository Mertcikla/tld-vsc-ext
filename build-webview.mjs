import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as path from 'node:path'

const extensionRoot = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(extensionRoot, '../tld/frontend')
const requireFrontend = createRequire(path.join(frontendRoot, 'package.json'))
const { build } = await import(pathToFileURL(requireFrontend.resolve('vite')).href)

// Keep the shared frontend's VS Code overrides, with an extension-owned entry.
await build({
  root: frontendRoot,
  configFile: path.join(frontendRoot, 'vite.vscode.config.ts'),
  build: {
    rollupOptions: { input: path.join(extensionRoot, 'webview/entry.tsx') },
  },
})
