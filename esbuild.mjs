import * as esbuild from 'esbuild'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const watch = process.argv.includes('--watch')

/** Recursively copy a directory tree from src to dest */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/** Copy .scm query files from src/queries → out/queries */
function copyQueryFiles() {
  const srcQueries = path.join(__dirname, 'src', 'queries')
  const outQueries = path.join(__dirname, 'out', 'queries')
  if (fs.existsSync(srcQueries)) {
    copyDir(srcQueries, outQueries)
    console.log('Query files copied to out/queries/')
  }
}

const options = {
  entryPoints: {
    extension: 'src/extension.ts',
    'run-arch-test': '../tests/realworld/test-runner/run-arch-test.ts'
  },
  bundle: true,
  outdir: 'out',
  external: ['vscode', '@kreuzberg/tree-sitter-language-pack', 'cli-table3', 'glob'],
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

// Always copy static assets
copyQueryFiles()

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(options)
  console.log('Extension built successfully.')
}
