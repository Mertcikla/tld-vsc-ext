import * as esbuild from 'esbuild'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const watch = process.argv.includes('--watch')

const options = {
  entryPoints: {
    extension: 'src/extension.ts',
  },
  bundle: true,
  outdir: 'out',
  external: ['vscode', 'cli-table3', 'glob', '@bufbuild/protobuf/codegenv2', '@bufbuild/protobuf/wkt'],
  // @bufbuild/protobuf internal sub-paths are used by generated proto but may not be in exports map
  plugins: [{
    name: 'bufbuild-resolve',
    setup(build) {
      build.onResolve({ filter: /^@bufbuild\/protobuf\/(codegenv2|wkt)$/ }, (args) => {
        return { external: true }
      })
    },
  }],
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
