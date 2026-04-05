import * as esbuild from 'esbuild'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const watch = process.argv.includes('--watch')

/** @type {esbuild.BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'], // vscode is provided by the VS Code runtime, never bundle it
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  alias: {
    // Resolve @buf imports to local generated files so we don't need the BSR package installed
    '@buf/tldiagramcom_diagram.bufbuild_es/diag/v1/auth_service_pb':
      path.resolve(__dirname, '../frontend/src/gen/diag/v1/auth_service_pb.ts'),
    '@buf/tldiagramcom_diagram.bufbuild_es/diag/v1/diagram_service_pb':
      path.resolve(__dirname, '../frontend/src/gen/diag/v1/diagram_service_pb.ts'),
  },
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(options)
  console.log('Extension built successfully.')
}
