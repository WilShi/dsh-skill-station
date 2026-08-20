/**
 * Client bundle build: esbuild-bundles the client entry to CJS with the
 * platform seed modules external, then wraps the result in the
 * `window.__ModuleLoader__.load` factory form the shell loader expects.
 */

import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(root, 'src/client/index.tsx')
const outDir = join(root, 'client')
const tmpFile = join(root, '.tmp/client.cjs')
const outFile = join(outDir, 'client.js')

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  jsxImportSource: 'react',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/*'],
  outfile: tmpFile,
  sourcemap: false,
  minify: false,
  logLevel: 'warning',
})

const cjs = await readFile(tmpFile, 'utf8')
const wrapped = `window.__ModuleLoader__.load({
  id: "dsh-skill-station",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${cjs}
    return module.exports;
  }
});
`
await mkdir(outDir, { recursive: true })
await writeFile(outFile, wrapped, 'utf8')
console.log(`client bundle written: ${outFile} (${String(wrapped.length)} bytes)`)
