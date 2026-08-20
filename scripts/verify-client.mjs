/**
 * Client bundle sanity gate: the built artifact must keep the ModuleLoader
 * wrapper, the plugin id, and the apply/inject exports the shell consumes.
 * Run after `npm run build`; exits non-zero on any miss.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = await readFile(join(root, 'client/client.js'), 'utf8')

const checks = [
  ['ModuleLoader wrapper', /window\.__ModuleLoader__\.load\(\{\s*id: "dsh-skill-station",\s*factory: \(require\) => \{/.test(bundle)],
  ['factory returns exports', /return module\.exports;/.test(bundle)],
  ['react externalized', /require\("react"\)/.test(bundle)],
  ['jsx runtime externalized', /require\("react\/jsx-runtime"\)/.test(bundle)],
  ['no bundled react copy', !/react-dom\.production/.test(bundle)],
  ['slot registrations present', bundle.includes('sidebar.footer.action') && bundle.includes('settings.section')],
]

let failed = false
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed = true
}
process.exit(failed ? 1 : 0)
