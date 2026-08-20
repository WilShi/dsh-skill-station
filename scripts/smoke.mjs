/**
 * In-process smoke: boots the station API handler behind a bare node:http
 * server on an ephemeral port with a fake host context, exercises every
 * endpoint against a temp DSH_HOME, and reports pass/fail per step. Run with
 * `node scripts/smoke.mjs` after `npm run build`.
 */

import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeApiHandler } from '../lib/api.js'

const failures = []
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail !== '' ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const dir = await mkdtemp(join(tmpdir(), 'station-smoke-'))
process.env.DSH_HOME = join(dir, 'dsh-home')

// Fixture: an "external" Claude skill library with one skill.
const claudeSkill = join(dir, 'external', 'claude-skills', 'demo-skill')
await mkdir(claudeSkill, { recursive: true })
await writeFile(join(claudeSkill, 'SKILL.md'), '---\nname: demo-skill\ndescription: smoke fixture\n---\nDo the demo.\n')
await mkdir(join(claudeSkill, 'assets'), { recursive: true })
await writeFile(join(claudeSkill, 'assets', 'note.txt'), 'asset')

const sources = [{ id: 'claude', label: 'Claude Code', userDirs: [join(dir, 'external', 'claude-skills')], projectDirs: [] }]
const fakeCtx = { get: () => undefined }
const handler = makeApiHandler(fakeCtx, { sources })

const server = createServer((req, res) => { void handler(req, res) })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${String(server.address().port)}/skill-station/api`

const get = async path => {
  const resp = await fetch(base + path)
  return { status: resp.status, body: await resp.json() }
}
const post = async (path, body) => {
  const resp = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: resp.status, body: await resp.json() }
}

// 1. Roots.
const roots = await get('/roots')
check('GET /roots', roots.status === 200 && Array.isArray(roots.body.workspaces), JSON.stringify(roots.body))

// 2. Empty library (the temp user-dsh root; user-agents may hold real skills).
const empty = await get('/skills')
const tempGroup = empty.body.groups?.find(g => g.rootId === 'user-dsh')
check('GET /skills (empty temp root)', empty.status === 200 && tempGroup !== undefined && tempGroup.skills.length === 0)

// 3. Scan finds the fixture.
const scan = await post('/scan', {})
const candidates = scan.body.reports?.[0]?.candidates ?? []
check('POST /scan finds fixture', scan.status === 200 && candidates.length === 1 && candidates[0].name === 'demo-skill', JSON.stringify(candidates))

// 4. Import it.
const imp = await post('/import', { items: [{ sourcePath: claudeSkill }], targetRoot: 'user-dsh', conflict: 'skip' })
check('POST /import', imp.status === 200 && imp.body.outcomes?.[0]?.status === 'imported', JSON.stringify(imp.body))

// 5. Library now lists it.
const listed = await get('/skills')
const skill = listed.body.groups?.[0]?.skills?.[0]
check('GET /skills lists import', listed.status === 200 && skill?.name === 'demo-skill' && skill.meta.modelInvocable === true)

// 6. Toggle disables model invocation.
const off = await post('/toggle', { rootId: 'user-dsh', name: 'demo-skill', modelInvocable: false })
const afterOff = await get('/skills')
check('POST /toggle off', off.status === 200 && afterOff.body.groups[0].skills[0].meta.modelInvocable === false)

// 7. Toggle back on.
const on = await post('/toggle', { rootId: 'user-dsh', name: 'demo-skill', modelInvocable: true })
const afterOn = await get('/skills')
check('POST /toggle on', on.status === 200 && afterOn.body.groups[0].skills[0].meta.modelInvocable === true)

// 8. Upload installs a dropped folder.
const uploadSkillMd = '---\nname: dropped-skill\ndescription: from a drop\n---\nbody\n'
const upload = await post('/upload', {
  targetRoot: 'user-dsh', conflict: 'skip',
  files: [
    { path: 'dropped/SKILL.md', contentBase64: Buffer.from(uploadSkillMd).toString('base64') },
    { path: 'dropped/assets/x.txt', contentBase64: Buffer.from('x').toString('base64') },
  ],
})
check('POST /upload', upload.status === 200 && upload.body.outcome?.name === 'dropped-skill', JSON.stringify(upload.body))

// 9. Delete moves to trash.
const del = await post('/delete', { rootId: 'user-dsh', name: 'dropped-skill' })
const trash = await get('/trash')
check('POST /delete → trash', del.status === 200 && trash.body.entries.length === 1 && trash.body.entries[0].manifest.name === 'dropped-skill')

// 10. Restore brings it back.
const restore = await post('/trash-restore', { id: trash.body.entries[0].id })
const afterRestore = await get('/skills')
check('POST /trash-restore', restore.status === 200 && afterRestore.body.groups[0].skills.some(s => s.name === 'dropped-skill'))

// 10b. Flat-file skills trash and restore like bundles.
await writeFile(join(process.env.DSH_HOME, 'skills', 'flat-skill.md'), '---\nname: flat-skill\ndescription: flat\n---\nflat\n')
const delFlat = await post('/delete', { rootId: 'user-dsh', name: 'flat-skill' })
const trashFlat = await get('/trash')
const flatEntry = (trashFlat.body.entries ?? []).find(e => e.manifest.name === 'flat-skill')
check('flat-file delete → trash', delFlat.status === 200 && flatEntry !== undefined, JSON.stringify(delFlat.body))
const restoreFlat = await post('/trash-restore', { id: flatEntry?.id ?? '' })
const flatBack = await get('/skills')
check('flat-file restore', restoreFlat.status === 200 && flatBack.body.groups[0].skills.some(s => s.name === 'flat-skill' && s.kind === 'file'))

// 11. Path traversal on upload is rejected.
const evil = await post('/upload', {
  targetRoot: 'user-dsh', conflict: 'skip',
  files: [{ path: '../evil.md', contentBase64: Buffer.from('x').toString('base64') }],
})
check('upload path traversal rejected', evil.status === 500 || evil.status === 400, `HTTP ${String(evil.status)}`)

// 12. Empty the trash.
const emptied = await post('/trash-empty', {})
const trashAfter = await get('/trash')
check('POST /trash-empty', emptied.status === 200 && trashAfter.body.entries.length === 0)

server.close()
await rm(dir, { recursive: true, force: true })
delete process.env.DSH_HOME

console.log(failures.length === 0 ? '\nSMOKE OK — all steps passed' : `\nSMOKE FAILED — ${String(failures.length)} step(s): ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
