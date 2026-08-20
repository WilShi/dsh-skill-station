# dsh-skill-station

[English](README.md) | 中文

装在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里的技能站：侧边栏一个按钮打开面板，扫描 Claude Code、Codex CLI、Cursor、Gemini CLI 的技能库，一键导入，管理全局与项目技能，拖个文件夹进去就装好。

## 安装

```sh
dsh plugin --profile web add dsh-skill-station
```

重启 `dsh web`。侧边栏设置按钮上方会出现「技能站」入口，设置页里也有对应分区。

## 功能

- **技能库** — 可写根目录下的全部技能，按来源分组：全局 `~/.dsh/skills`、共享 `~/.agents/skills`、以及每个工作区的 `<project>/.dsh/skills` / `.agents/skills`。支持搜索、启停（改写 frontmatter 的 `disable-model-invocation`）、删除（进可恢复的回收站）。
- **导入技能** — 只读扫描 `~/.claude/skills`、`~/.codex/skills`、`~/.cursor/skills`、`~/.gemini/antigravity/skills`、`~/.gemini/skills`，以及所选工作区下的 `.claude|.codex|.cursor|.gemini/skills`。勾选候选、选择目标根、按冲突策略导入（跳过 / 改名 / 替换——被替换的进回收站）。导入后无需重启即可在会话中生效。
- **拖拽安装** — 把一个或多个技能文件夹拖进安装页，或用文件夹选择器。先校验（SKILL.md 需含 kebab-case `name` 与 `description`）并预览，确认后才写入。
- **回收站** — 删除的技能移入 `~/.dsh/skill-station/trash` 并记录来源，可在面板中恢复或清空。

## 安全模型

- 写操作只会落在上述可写技能根内；每个路径在规范化后做包含性检查，复制时不跟随 symlink，上传拒绝路径穿越。
- 变更类 HTTP 接口拒绝跨源请求；API 与 GUI 同一本地服务。
- 外部 agent 目录仅做只读扫描，永不修改。
- 上传与导入的技能是第三方内容，启用前请先审阅。

## 配置

均可选，写在 profile 补丁层的 `dsh-skill-station` 插件行下：

```yaml
plugins:
  dsh-skill-station:
    maxBodyBytes: 67108864      # 上传请求上限（默认 64 MB）
    sources:                    # 完整替换默认扫描源
      - id: claude
        label: Claude Code
        userDirs: ['~/.claude/skills']
        projectDirs: ['.claude/skills']
```

## 开发

```sh
npm install
npm run build     # tsc 服务端构建 + esbuild 客户端 bundle
npm test          # vitest 单元测试
node scripts/smoke.mjs   # 进程内 API 冒烟（需先构建）
```

客户端 bundle 通过宿主的 `window.__ModuleLoader__` 加载，注册到 `sidebar.footer.action` 与 `settings.section` 两个插槽。

## 许可证

MIT
