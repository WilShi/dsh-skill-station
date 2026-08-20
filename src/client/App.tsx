/**
 * Station main UI: tabs for the skill library, external import, drag-and-drop
 * install, and the trash. Shared between the sidebar drawer and the settings
 * section. Product copy is Chinese; comments are English.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteSkill, emptyTrash, fetchRoots, fetchSkills, fetchTrash, importSkills,
  restoreTrash, scanSources, toggleSkill, uploadFiles,
  type ImportOutcome, type ScanCandidate, type SkillGroup, type SourceScan, type TrashEntry, type WorkspaceRow,
} from './api.ts'

/** Root ids that always exist (global targets). */
const GLOBAL_ROOTS = [
  { id: 'user-dsh', label: '全局 ~/.dsh/skills' },
  { id: 'user-agents', label: '共享 ~/.agents/skills' },
] as const

/** Format a byte count for display.
 * @param bytes - size in bytes.
 * @returns human-readable size string. */
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** The station root component.
 * @param props - optional fixed workspace (unused for now; reserved). */
export function StationApp(props: { embedded?: boolean }): JSX.Element {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([])
  const [workspace, setWorkspace] = useState('')
  const [tab, setTab] = useState<'library' | 'import' | 'install' | 'trash'>('library')

  useEffect(() => {
    void fetchRoots().then(r => { if (r.ok) setWorkspaces(r.body.workspaces ?? []) })
  }, [])

  const wsParam = workspace

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="ss_tabs" role="tablist">
        {([['library', '技能库'], ['import', '导入技能'], ['install', '拖拽安装'], ['trash', '回收站']] as const).map(([id, label]) => (
          <button key={id} className="ss_tab" data-on={tab === id ? 'true' : undefined} role="tab" onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab !== 'trash' ? (
        <div className="ss_wsBar">
          <span className="ss_meta">作用域</span>
          <select className="ss_select" value={workspace} onChange={e => setWorkspace(e.target.value)}>
            <option value="">全局（用户技能）</option>
            {workspaces.map(ws => <option key={ws.path} value={ws.path}>{ws.title}</option>)}
          </select>
        </div>
      ) : null}
      <div className="ss_body">
        {tab === 'library' ? <LibraryTab workspace={wsParam} /> : null}
        {tab === 'import' ? <ImportTab workspace={wsParam} /> : null}
        {tab === 'install' ? <InstallTab workspace={wsParam} /> : null}
        {tab === 'trash' ? <TrashTab /> : null}
      </div>
    </div>
  )
}

/** Target root + conflict policy selector shared by import and install tabs.
 * @param props - current values, workspace, and change callbacks. */
function TargetSelector(props: {
  workspace: string
  targetRoot: string
  conflict: string
  onTarget: (value: string) => void
  onConflict: (value: string) => void
}): JSX.Element {
  return (
    <div className="ss_row" style={{ justifyContent: 'space-between' }}>
      <select className="ss_select" value={props.targetRoot} onChange={e => props.onTarget(e.target.value)} title="导入目标">
        {GLOBAL_ROOTS.map(root => <option key={root.id} value={root.id}>{root.label}</option>)}
        {props.workspace !== ''
          ? [
            <option key="project-dsh" value={`project-dsh:${props.workspace}`}>项目 .dsh/skills</option>,
            <option key="project-agents" value={`project-agents:${props.workspace}`}>项目 .agents/skills</option>,
          ]
          : null}
      </select>
      <select className="ss_select" style={{ flex: 'none', width: 120 }} value={props.conflict} onChange={e => props.onConflict(e.target.value)} title="同名冲突策略">
        <option value="skip">冲突跳过</option>
        <option value="rename">冲突改名</option>
        <option value="replace">冲突替换</option>
      </select>
    </div>
  )
}

/** Skill library tab: browse, toggle, and delete installed skills.
 * @param props - the workspace scope to display. */
function LibraryTab(props: { workspace: string }): JSX.Element {
  const [groups, setGroups] = useState<SkillGroup[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    void fetchSkills(props.workspace).then(r => {
      if (r.ok) setGroups(r.body.groups ?? [])
      else setError(`加载失败（HTTP ${String(r.status)}）`)
    }).catch(e => setError(String(e)))
  }, [props.workspace])

  useEffect(() => { load() }, [load])

  const onToggle = (rootId: string, name: string, modelInvocable: boolean): void => {
    setBusy(`${rootId}/${name}`)
    void toggleSkill({ rootId, name, ...(props.workspace !== '' ? { workspace: props.workspace } : {}), modelInvocable })
      .then(r => { if (!r.ok) setError(`切换失败（HTTP ${String(r.status)}）`) })
      .catch(e => setError(String(e)))
      .finally(() => { setBusy(''); load() })
  }

  const onDelete = (rootId: string, name: string): void => {
    if (!window.confirm(`把技能「${name}」移入回收站？可在回收站恢复。`)) return
    setBusy(`${rootId}/${name}`)
    void deleteSkill({ rootId, name, ...(props.workspace !== '' ? { workspace: props.workspace } : {}) })
      .then(r => { if (!r.ok) setError(`删除失败（HTTP ${String(r.status)}）`) })
      .catch(e => setError(String(e)))
      .finally(() => { setBusy(''); load() })
  }

  const filtered = useMemo(() => groups.map(group => ({
    ...group,
    skills: group.skills.filter(skill =>
      query === '' || skill.name.includes(query) || (skill.meta?.description ?? '').toLowerCase().includes(query.toLowerCase())),
  })), [groups, query])

  return (
    <>
      <input className="ss_search" placeholder="搜索技能名称或描述" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="ss_row" style={{ justifyContent: 'space-between' }}>
        <span className="ss_meta">启用开关控制模型能否调用该技能；删除会移入回收站。</span>
        <button className="ss_btn" onClick={load}>刷新</button>
      </div>
      {error !== '' ? <div className="ss_err">{error}</div> : null}
      {filtered.every(group => group.skills.length === 0)
        ? <div className="ss_empty">这里还没有技能。去「导入技能」或「拖拽安装」添加一个吧。</div>
        : filtered.map(group => group.skills.length === 0 ? null : (
          <div key={group.rootId}>
            <div className="ss_groupTitle">{group.label}</div>
            {group.skills.map(skill => {
              const enabled = skill.meta?.modelInvocable ?? true
              return (
                <div className="ss_card" key={`${group.rootId}/${skill.name}`}>
                  <div className="ss_cardHead">
                    <span className="ss_name" title={skill.path}>{skill.name}</span>
                    <span className={`ss_badge ${enabled ? 'on' : 'off'}`}>{enabled ? '模型可调用' : '已停用'}</span>
                    {skill.kind === 'file' ? <span className="ss_badge">单文件</span> : null}
                  </div>
                  {skill.meta?.description !== undefined && skill.meta.description !== ''
                    ? <div className="ss_desc">{skill.meta.description}</div>
                    : <div className="ss_desc">（无描述）</div>}
                  <div className="ss_actions">
                    <button
                      className="ss_switch" data-on={enabled ? 'true' : undefined} role="switch" aria-checked={enabled}
                      title={enabled ? '停用（模型不再可见）' : '启用'}
                      disabled={busy === `${group.rootId}/${skill.name}`}
                      onClick={() => onToggle(group.rootId, skill.name, !enabled)}
                    ><span className="ss_switchThumb" /></button>
                    <span className="ss_meta">{enabled ? '已启用' : '已停用'}</span>
                    <span style={{ flex: 1 }} />
                    <button className="ss_btn danger" disabled={busy === `${group.rootId}/${skill.name}`} onClick={() => onDelete(group.rootId, skill.name)}>删除</button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
    </>
  )
}

/** External import tab: scan other agents' skill libraries and import.
 * @param props - the workspace scope for project-level directories. */
function ImportTab(props: { workspace: string }): JSX.Element {
  const [reports, setReports] = useState<SourceScan[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetRoot, setTargetRoot] = useState('user-dsh')
  const [conflict, setConflict] = useState('skip')
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  const scan = (): void => {
    setScanning(true)
    setError('')
    setOutcomes(null)
    void scanSources(props.workspace)
      .then(r => {
        if (r.ok) {
          setReports(r.body.reports ?? [])
          setSelected(new Set())
        } else setError(`扫描失败（HTTP ${String(r.status)}）`)
      })
      .catch(e => setError(String(e)))
      .finally(() => setScanning(false))
  }

  useEffect(() => { scan() }, [props.workspace]) // eslint-disable-line react-hooks/exhaustive-deps

  const keyOf = (candidate: ScanCandidate): string => candidate.path

  const togglePick = (candidate: ScanCandidate): void => {
    setSelected(prev => {
      const next = new Set(prev)
      const key = keyOf(candidate)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const doImport = (): void => {
    if (reports === null || selected.size === 0) return
    const items = reports.flatMap(report => report.candidates)
      .filter(candidate => selected.has(keyOf(candidate)))
      .map(candidate => ({ sourcePath: candidate.path }))
    setImporting(true)
    setError('')
    void importSkills({ items, targetRoot, conflict, ...(props.workspace !== '' ? { workspace: props.workspace } : {}) })
      .then(r => {
        if (r.ok) {
          setOutcomes(r.body.outcomes ?? [])
          setSelected(new Set())
          scan()
        } else setError(`导入失败（HTTP ${String(r.status)}）`)
      })
      .catch(e => setError(String(e)))
      .finally(() => setImporting(false))
  }

  return (
    <>
      <div className="ss_row" style={{ justifyContent: 'space-between' }}>
        <span className="ss_meta">扫描 Claude Code / Codex / Cursor / Gemini 的技能目录（只读）。</span>
        <button className="ss_btn" onClick={scan} disabled={scanning}>{scanning ? '扫描中…' : '重新扫描'}</button>
      </div>
      <TargetSelector workspace={props.workspace} targetRoot={targetRoot} conflict={conflict} onTarget={setTargetRoot} onConflict={setConflict} />
      {error !== '' ? <div className="ss_err">{error}</div> : null}
      {outcomes !== null ? (
        <div className="ss_card">
          <div className="ss_cardHead"><span className="ss_name">导入结果</span></div>
          {outcomes.map(outcome => (
            <div className="ss_row" key={outcome.sourcePath}>
              <span className={`ss_badge ${outcome.status === 'skipped' ? 'warn' : 'on'}`}>{outcome.status}</span>
              <span className="ss_meta">{outcome.name !== '' ? outcome.name : outcome.sourcePath}{outcome.error !== undefined ? ` — ${outcome.error}` : ''}</span>
            </div>
          ))}
        </div>
      ) : null}
      {reports === null
        ? <div className="ss_empty">{scanning ? '正在扫描…' : '点击「重新扫描」开始'}</div>
        : reports.map(report => (
          <div key={report.source.id}>
            <div className="ss_groupTitle">{report.source.label} · {report.candidates.length} 个技能</div>
            {report.candidates.length === 0
              ? <div className="ss_empty">未发现技能（{report.scannedDirs.length === 0 ? '目录不存在' : '目录为空'}）</div>
              : report.candidates.map(candidate => (
                <div className="ss_card" key={candidate.path}>
                  <div className="ss_cardHead">
                    <input type="checkbox" checked={selected.has(keyOf(candidate))} onChange={() => togglePick(candidate)} />
                    <span className="ss_name">{candidate.name}</span>
                    {candidate.conflict ? <span className="ss_badge warn">已存在同名</span> : null}
                    <span className="ss_badge">{candidate.scope === 'project' ? '项目' : '用户'}</span>
                    <span className="ss_meta">{fmtSize(candidate.sizeBytes)}</span>
                  </div>
                  {candidate.description !== '' ? <div className="ss_desc">{candidate.description}</div> : null}
                  <div className="ss_meta">{candidate.path}</div>
                </div>
              ))}
          </div>
        ))}
      {reports !== null && reports.some(report => report.candidates.length > 0) ? (
        <button className="ss_btn primary" onClick={doImport} disabled={importing || selected.size === 0}>
          {importing ? '导入中…' : `导入所选（${String(selected.size)}）`}
        </button>
      ) : null}
    </>
  )
}

/** Drag-and-drop install tab.
 * @param props - the workspace scope for project targets. */
function InstallTab(props: { workspace: string }): JSX.Element {
  const [targetRoot, setTargetRoot] = useState('user-dsh')
  const [conflict, setConflict] = useState('skip')
  const [pending, setPending] = useState<{ path: string; contentBase64: string }[] | null>(null)
  const [pendingSource, setPendingSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const submit = (files: { path: string; contentBase64: string }[]): void => {
    setBusy(true)
    setError('')
    void uploadFiles({ files, targetRoot, conflict, ...(props.workspace !== '' ? { workspace: props.workspace } : {}) })
      .then(r => {
        setOutcome(r.body.outcome ?? null)
        // 400/500 的响应体是 {error}；409 是 {outcome:{error}} — 优先显示服务端原文。
        const serverError = (r.body as { error?: string }).error
        if (!r.ok && r.body.outcome?.error === undefined) {
          setError(serverError !== undefined ? `安装失败：${serverError}` : `安装失败（HTTP ${String(r.status)}）`)
        }
      })
      .catch(e => setError(String(e)))
      .finally(() => { setBusy(false); setPending(null) })
  }

  const onDrop = (event: React.DragEvent): void => {
    event.preventDefault()
    setOver(false)
    setError('')
    setOutcome(null)
    const items = Array.from(event.dataTransfer?.items ?? [])
    const entries = items
      .map(item => (item as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.())
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry !== undefined)
    if (entries.length === 0) {
      setError('浏览器未提供文件内容：请改用下方「选择文件夹」按钮。')
      return
    }
    void collectEntries(entries).then(async files => {
      if (files.length === 0) {
        setError('拖入的内容里没有文件。')
        return
      }
      setPending(await dropFilesToPayloads(files))
      setPendingSource('拖拽')
    }).catch(e => setError(String(e)))
  }

  const onPick = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setError('')
    setOutcome(null)
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return
    void Promise.all(files.map(fileToPayload)).then(payloads => {
      setPending(payloads)
      setPendingSource('文件夹选择')
    }).catch(e => setError(String(e)))
    event.target.value = ''
  }

  return (
    <>
      <div
        className="ss_drop" data-over={over ? 'true' : undefined}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <div style={{ fontSize: 26 }} aria-hidden="true">🗂️</div>
        <div>把 skill 文件夹拖到这里</div>
        <div className="ss_meta">需包含 SKILL.md；也可选择多个技能文件夹一起导入</div>
        <button className="ss_btn" onClick={() => inputRef.current?.click()}>选择文件夹…</button>
        {/* webkitdirectory is non-standard; the cast keeps TS happy. */}
        <input
          ref={inputRef} type="file" multiple style={{ display: 'none' }}
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={onPick}
        />
      </div>
      <TargetSelector workspace={props.workspace} targetRoot={targetRoot} conflict={conflict} onTarget={setTargetRoot} onConflict={setConflict} />
      {error !== '' ? <div className="ss_err">{error}</div> : null}
      {outcome !== null ? (
        <div className={`ss_${outcome.status === 'skipped' ? 'err' : 'ok'}`}>
          {outcome.status === 'skipped'
            ? `未安装：${outcome.error ?? '已跳过'}`
            : `已安装「${outcome.name}」→ ${outcome.targetPath ?? ''}`}
        </div>
      ) : null}
      {pending !== null ? (
        <div className="ss_dialog" onClick={() => setPending(null)}>
          <div className="ss_dialogBox" onClick={e => e.stopPropagation()}>
            <div className="ss_dialogTitle">确认安装（{pendingSource}，{String(pending.length)} 个文件）</div>
            <div className="ss_pre">{pending.slice(0, 50).map(file => file.path).join('\n')}{pending.length > 50 ? `\n… 其余 ${String(pending.length - 50)} 个文件` : ''}</div>
            <div className="ss_meta">技能名取自 SKILL.md frontmatter 的 name 字段；安装前请确认来源可信。</div>
            <div className="ss_actions" style={{ justifyContent: 'flex-end' }}>
              <button className="ss_btn" onClick={() => setPending(null)} disabled={busy}>取消</button>
              <button className="ss_btn primary" onClick={() => submit(pending)} disabled={busy}>{busy ? '安装中…' : '确认安装'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

/** Trash tab: restore or permanently empty. */
function TrashTab(): JSX.Element {
  const [entries, setEntries] = useState<TrashEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    void fetchTrash().then(r => { if (r.ok) setEntries(r.body.entries ?? []) }).catch(e => setError(String(e)))
  }, [])

  useEffect(() => { load() }, [load])

  const onRestore = (id: string): void => {
    setBusy(true)
    setError('')
    void restoreTrash(id).then(r => {
      if (!r.ok) setError(String((r.body as { error?: string }).error ?? `恢复失败（HTTP ${String(r.status)}）`))
    }).catch(e => setError(String(e))).finally(() => { setBusy(false); load() })
  }

  const onEmpty = (): void => {
    if (!window.confirm('永久清空回收站？此操作不可恢复。')) return
    setBusy(true)
    void emptyTrash().catch(e => setError(String(e))).finally(() => { setBusy(false); load() })
  }

  return (
    <>
      <div className="ss_row" style={{ justifyContent: 'space-between' }}>
        <span className="ss_meta">删除的技能会保留在这里，可恢复到原位置。</span>
        <div className="ss_actions">
          <button className="ss_btn" onClick={load}>刷新</button>
          <button className="ss_btn danger" onClick={onEmpty} disabled={busy || entries.length === 0}>清空回收站</button>
        </div>
      </div>
      {error !== '' ? <div className="ss_err">{error}</div> : null}
      {entries.length === 0
        ? <div className="ss_empty">回收站是空的。</div>
        : entries.map(entry => (
          <div className="ss_card" key={entry.id}>
            <div className="ss_cardHead">
              <span className="ss_name">{entry.manifest.name}</span>
              <span className="ss_meta">{entry.manifest.deletedAt}</span>
            </div>
            <div className="ss_meta">来自：{entry.manifest.from}</div>
            <div className="ss_actions" style={{ justifyContent: 'flex-end' }}>
              <button className="ss_btn" onClick={() => onRestore(entry.id)} disabled={busy}>恢复</button>
            </div>
          </div>
        ))}
    </>
  )
}

/** Walk dropped FileSystemEntries into flat relative-path file lists.
 * @param entries - top-level entries from the drop.
 * @returns relative path plus File for every dropped file. */
async function collectEntries(entries: unknown[]): Promise<{ path: string; file: File }[]> {
  const out: { path: string; file: File }[] = []
  const walk = async (entry: unknown, prefix: string): Promise<void> => {
    if (out.length >= 10000) throw new Error('文件夹里的文件超过 10000 个，暂不支持整体安装')
    const node = entry as { isFile?: boolean; isDirectory?: boolean; name: string; file?: (ok: (f: File) => void, err: (e: unknown) => void) => void; createReader?: () => { readEntries: (ok: (batch: unknown[]) => void, err: (e: unknown) => void) => void } }
    if (node.isFile === true) {
      const file = await new Promise<File>((resolve, reject) => {
        if (node.file === undefined) reject(new Error('unsupported drop entry'))
        else node.file(resolve, reject)
      })
      out.push({ path: `${prefix}${node.name}`, file })
    } else if (node.isDirectory === true && node.createReader !== undefined) {
      const reader = node.createReader()
      for (;;) {
        const batch = await new Promise<unknown[]>((resolve, reject) => reader.readEntries(resolve, reject))
        if (batch.length === 0) break
        for (const child of batch) await walk(child, `${prefix}${node.name}/`)
      }
    }
  }
  for (const entry of entries) await walk(entry, '')
  return out
}

/** Convert one picked File (with webkitRelativePath) into an upload payload.
 * @param file - file from a webkitdirectory input.
 * @returns relative path plus base64 content. */
async function fileToPayload(file: File): Promise<{ path: string; contentBase64: string }> {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  const path = relative !== undefined && relative !== '' ? relative : file.name
  const buffer = await file.arrayBuffer()
  return { path, contentBase64: bytesToBase64(new Uint8Array(buffer)) }
}

/** Encode bytes to base64 without blowing the call stack.
 * @param bytes - content bytes.
 * @returns base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Convert dropped files into upload payloads (install tab helper).
 * @param files - dropped files with relative paths.
 * @returns upload payloads. */
export async function dropFilesToPayloads(files: { path: string; file: File }[]): Promise<{ path: string; contentBase64: string }[]> {
  return Promise.all(files.map(async ({ path, file }) => ({ path, contentBase64: bytesToBase64(new Uint8Array(await file.arrayBuffer())) })))
}
