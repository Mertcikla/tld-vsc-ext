import * as esbuild from 'esbuild'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const watch = process.argv.includes('--watch')
const localWorkspaceService = path.resolve(__dirname, '../tld/frontend/src/gen/diag/v1/workspace_service_pb.ts')

const options = {
  entryPoints: {
    extension: 'src/extension.ts',
  },
  bundle: true,
  outdir: 'out',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  alias: fs.existsSync(localWorkspaceService) ? {
    // Resolve @buf imports to local generated files so the extension host bundle
    // matches the workspace-local proto overlay.
    '@buf/tldiagramcom_diagram.bufbuild_es/diag/v1/workspace_service_pb':
      localWorkspaceService,
  } : {},
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(options)
  console.log('Extension built successfully.')
}
