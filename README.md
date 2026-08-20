# dsh-skill-station

English | [中文](README.zh.md)

A skill hub inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): one sidebar button opens a panel that scans the skill libraries of Claude Code, Codex CLI, Cursor, and Gemini CLI, imports skills with one click, manages global and project skills, and installs a skill folder by dragging it in.

## Install

```sh
dsh plugin --profile web add dsh-skill-station
```

Restart `dsh web`. The station appears as a 技能站 button above Settings in the sidebar, and as a settings section.

## What you get

- **Skill library** — every skill in the writable roots, grouped: global `~/.dsh/skills`, shared `~/.agents/skills`, and per-workspace `<project>/.dsh/skills` / `.agents/skills`. Search, enable/disable (rewrites the `disable-model-invocation` frontmatter flag), delete into a restorable trash.
- **External import** — read-only scan of `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.gemini/antigravity/skills` and `~/.gemini/skills`, plus each selected workspace's `.claude|.codex|.cursor|.gemini/skills`. Pick candidates, choose a target root, import with a conflict policy (skip / rename / replace — replaced skills go to the trash). Skills appear in the session catalog without a restart.
- **Drag-and-drop install** — drop a skill folder (or several) or a `.zip` archive onto the install tab, or pick them. Zip archives are decompressed server-side, which also carries large skills with vendored dependency trees. Files are validated (SKILL.md with kebab-case `name` and `description`) and previewed before anything is written.
- **Local path install** — paste the absolute path of a skill folder already on this machine and the server copies it disk-to-disk: no upload, no size limit. Every install is staged and renamed into place, so a failed copy never leaves a half-installed skill.
- **Trash** — deletions move to `~/.dsh/skill-station/trash` with an origin manifest; restore or empty from the panel.

## Security model

- Writes only ever land inside the writable skill roots listed above; every path is containment-checked after normalization, symlinks are never followed during copies, and uploads reject traversal segments.
- Mutating HTTP endpoints reject cross-origin requests; the API is served on the same local server as the GUI.
- External agent directories are scanned read-only; the station never modifies them.
- Uploaded and imported skills are third-party content — review them before enabling.

## Config

All fields optional, under the `dsh-skill-station` plugin row in your profile patch:

```yaml
plugins:
  dsh-skill-station:
    maxBodyBytes: 67108864      # upload request cap (default 64 MB)
    sources:                    # replace the default scan sources entirely
      - id: claude
        label: Claude Code
        userDirs: ['~/.claude/skills']
        projectDirs: ['.claude/skills']
```

## Development

```sh
npm install
npm run build     # tsc server build + esbuild client bundle
npm test          # vitest unit tests
node scripts/smoke.mjs   # in-process API smoke (needs a prior build)
```

The client bundle is served through the shell's `window.__ModuleLoader__` and registers into the `sidebar.footer.action` and `settings.section` slots.

## License

MIT
