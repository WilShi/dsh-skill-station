# dsh-skill-station 设计文档

DSH Web GUI 的技能中枢插件:侧边栏一键直达,扫描 Claude / Codex / Cursor / Gemini 的 SKILL.md 技能库一键导入,统一管理全局与项目技能,拖拽文件夹即装。

状态:设计中(待用户确认开放问题后进入 M1)。

## 1. 定位与边界

**做什么**:把「发现技能 → 导入技能 → 管理技能」做成一个可视化闭环。

- 侧边栏底部入口 + 设置页完整面板(同一组件两处挂载)
- 只读扫描外部 agent 技能目录,用户勾选后一键复制导入
- 全局(`~/.dsh/skills`、`~/.agents/skills`)与项目(`<workspace>/.dsh/skills`、`<workspace>/.agents/skills`)技能分组浏览、启停、删除(回收站可恢复)
- 拖拽 skill 文件夹 / 选择文件夹 / 上传 zip 直接安装

**不做什么**(v1 明确排除,避免与现有插件同质化膨胀):

- 不做技能市场/远程目录(那是 dshmarket 的职责)
- 不做技能内容 AI 进化、规范自动修复(v1 之后考虑)
- 不重复实现技能发现:导入后的技能由宿主原生 `dsh-skill-filesystem` provider 通过 watcher 自动发现,本插件只负责「把文件放到正确的位置」

## 2. 命名与发布

| 项 | 值 |
|---|---|
| npm 包名 | `dsh-skill-station`(已确认可用;备选 `dsh-skill-dock`、`dsh-skillmate`) |
| 插件 id | `dsh-skill-station`(cordis.patch.yml 的 insert id) |
| GitHub | `<用户账号>/dsh-skill-station`(待确认) |
| License | MIT |
| 上架 | npm 发布后向 awesome-dsh-plugin 提 PR 收录(市场要求 repository 字段指回同一 GitHub 仓库) |

## 3. 宿主事实(设计依据,均已在源码中验证)

### 3.1 技能注册表 `ctx.skills`

provider 制分层注册表,rank 去重,`skills/change` 事件通知目录失效。技能格式:目录 bundle(`<name>/SKILL.md`)或扁平 `<name>.md`,YAML frontmatter 必须含 `name`(kebab-case)与 `description`,可选 `when-to-use`、`disable-model-invocation`、`user-invocable`、`metadata`。

### 3.2 技能根目录(skill-filesystem provider)

| 根 | source | rank | 可写 |
|---|---|---|---|
| `<projectRoot>/.dsh/skills` | project-dsh | 100 | ✅ 项目技能默认导入目标 |
| `<projectRoot>/.agents/skills` | project-agents | 200 | ✅ |
| config `customSkillDirs` | custom | 300 | — |
| `~/.dsh/skills` | user-dsh | 400 | ✅ 全局技能默认导入目标 |
| `~/.agents/skills` | user-agents | 500 | ✅ |
| `$DSH_BUNDLED_SKILL_DIR` | bundled | 600 | ❌ 系统只读 |

关键性质:文件落盘后 watcher 自动触发 `skills/change`,**导入后无需重启**。

### 3.3 外部 agent 技能目录(扫描目标,可配置)

| Agent | 路径 | 格式 |
|---|---|---|
| Claude Code | `~/.claude/skills/`、`<project>/.claude/skills/` | SKILL.md bundle |
| Codex CLI | `~/.codex/skills/` | SKILL.md bundle |
| Cursor | `~/.cursor/skills/`、`<project>/.cursor/rules/*.mdc` | SKILL.md + mdc(转换) |
| Gemini CLI | `~/.gemini/antigravity/skills/` | SKILL.md bundle |

### 3.4 插件机制(社区插件形态,dshmarket / dsh-mcp-manager 同款)

- **服务端**:Cordis 函数插件 `name` / `inject: ['skills', 'webServer']` / `apply`;HTTP 路由经 `ctx.webServer.register({ kind: 'prefix', path: '/skill-station/api', handler })`,注册包在 `ctx.effect()` 里随生命周期卸载。
- **客户端**:打包为 `window.__ModuleLoader__.load({ id, factory })` bundle,`require('react')` 由宿主提供;`inject = ['slots']`,经 `ctx.slots.inject(slot, () => ctx.slots.register(...))` 挂载 UI。
- **package.json**:`dsh.client = { platform: 'web', inject: ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-settings'] }`,`dsh.bundle.patch` 指向 `cordis.patch.yml`;exports `.`(服务端)+ `./client`(客户端 bundle)。

### 3.5 UI 挂载点(已验证的 slot 契约)

- `sidebar.footer.action`(kind: list,owner props: `{ wide: boolean }`)— 侧边栏底部按钮区,设置按钮上方。**这是「侧边栏控制」的落点**:注册一个图标按钮,点击开关插件自绘的抽屉面板。
- `settings.section`(dsh-mcp-manager / dshmarket 已验证)— 设置页分区,挂完整管理面板。

## 4. 功能设计

### 4.1 侧边栏入口

侧边栏底部一个图标按钮(wide 模式显示图标+文字,rail 模式只显示图标)。点击切换一个从左缘滑出的抽屉面板(插件自绘 fixed 定位层,样式走 `--dsw-*` token),内容即技能管理主界面。设置页分区复用同一根组件。

### 4.2 技能库(My Skills)

- 数据:`ctx.skills.list({ cwd })` 的合并视图 + 按根目录分组的磁盘枚举;每条显示名称、描述、来源徽标(全局/项目/系统/自定义)、provider、路径。
- 项目维度:工作区选择器(复用宿主 workspace 列表服务,`ctx.get('workspaceRegistry')`),选中后列出该项目的技能;「全局」视图列 user 根。
- 详情抽屉:frontmatter 解析结果 + SKILL.md 正文渲染 + 文件树(bundle 型)。
- 启停:改写该技能 SKILL.md 的 frontmatter `disable-model-invocation` 布尔(这是宿主语义内的真禁用,目录与注册表保持一致);系统/bundled 技能只读不可改。
- 删除:移入回收站 `~/.dsh/skill-station/trash/<时间戳>-<name>/`,UI 可恢复或清空;不做硬删除。
- 搜索:前端按 name/description 过滤。

### 4.3 外部导入(Scan & Import)

1. **扫描** `POST /scan`:遍历 §3.3 配置的目录,解析每个候选的 frontmatter,输出候选列表:名称、描述、来源 agent、路径、大小、状态(未导入 / 已存在同名 / 源有更新)。
2. **冲突策略**:同名技能已存在时,逐条选 跳过 / 改名导入 / 替换(替换前旧版本进回收站)。
3. **目标选择**:全局(默认 `~/.dsh/skills`)或当前选中工作区的项目根(`<projectRoot>/.dsh/skills`)。
4. **导入** `POST /import`:服务端复制(目录 bundle 整体递归复制,跳过 symlink;单文件型补 `.md` 包装),逐个校验落盘结果,返回逐项结果。
5. 落盘后宿主 watcher 自动刷新目录,前端监听刷新即可,无需重启。

### 4.4 拖拽安装(Drop to Install)

- **拖目录**:HTML5 拖放 + `DataTransferItem.webkitGetAsEntry()` 递归读取(Chromium/Electron 均支持),文件内容经 JSON 分块上传;服务端先收到完整文件集再校验、再落盘(原子性:校验不过不写)。
- **选择文件夹**: `<input type="file" webkitdirectory>` 全浏览器兜底。
- **zip**:v1.1 再做(引入解压依赖)。
- 校验:必须存在 `SKILL.md` 或可推断的单一 md;frontmatter name/description 合法;name 冲突时弹出与导入相同的冲突策略。
- 落盘前预览:显示将写入的目标路径与文件清单,用户确认后才写。

## 5. HTTP API

前缀 `/skill-station/api`,全部 JSON。安全基线:

- 变更类请求(POST/DELETE)校验 `Origin` 同源或来自环回地址;
- 所有写操作限制在 §3.2 的可写根内,路径规范化后做包含性检查,拒绝 symlink 逃逸与 `..`;
- 上传总体积上限(默认 50 MB,可配置);
- 扫描为只读,永不修改外部 agent 目录。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/roots` | 可写目标根 + 外部扫描根清单与可达性 |
| GET | `/skills?cwd=` | 技能列表(注册表合并视图,按根分组) |
| GET | `/skills/:name?cwd=` | 详情:frontmatter、正文、文件树 |
| POST | `/scan` | 扫描外部 agent 目录,返回候选与冲突状态 |
| POST | `/import` | `{ items: [{path, rename?}], target, conflict }` 复制导入 |
| POST | `/upload` | 拖拽/选取的文件集,校验后写入目标根 |
| POST | `/skills/:name/toggle` | 改写 frontmatter 启停 |
| DELETE | `/skills/:name` | 移入回收站 |
| GET | `/trash` / POST | `/trash/:id/restore` / DELETE `/trash` | 回收站管理 |

## 6. 包结构

```
dsh-skill-station/
├── package.json            # dsh.client + dsh.bundle.patch + exports ./client
├── cordis.patch.yml        # - insert: { id: dsh-skill-station, name: dsh-skill-station }
├── src/
│   ├── index.ts            # 服务端插件:name/inject/Config/apply,注册路由
│   ├── api.ts              # 路由分发与请求校验
│   ├── roots.ts            # 目标根解析 + 路径包含性检查
│   ├── scanner.ts          # 外部 agent 目录扫描(纯函数 + fs 注入,可测)
│   ├── importer.ts         # 复制/冲突/回收站逻辑
│   ├── frontmatter.ts      # 解析与改写 YAML frontmatter(保留正文)
│   └── client/
│       ├── index.ts        # slots 注册:footer action + settings.section
│       ├── App.tsx         # 根组件(抽屉/分区共用)
│       ├── LibraryTab.tsx  # 技能库
│       ├── ImportTab.tsx   # 扫描与导入
│       ├── InstallTab.tsx  # 拖拽安装
│       └── styles.ts       # CSS 字符串注入(--dsw-* token)
├── tsdown.config.ts        # 客户端 bundle → client.js(ModuleLoader 包装)
├── tests/                  # vitest:scanner/importer/frontmatter/roots 单测 + 组装冒烟
└── README.md / README.zh.md
```

构建:tsc 出服务端 `lib/`,tsdown 出客户端 `client.js`;`prepack` 跑 typecheck + test + build。

## 7. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 | 包骨架 + settings.section 挂载 + 技能库只读列表/详情 | `dsh plugin add` 后设置里出现分区,列出真实技能 |
| M2 | 外部扫描 + 一键导入 + 冲突策略 + 侧边栏按钮/抽屉 | 从 ~/.claude/skills 导入一个技能,不重启即可在会话中触发 |
| M3 | 启停 + 回收站删除/恢复 + 拖拽安装 | 拖入一个 SKILL.md 目录,落盘并被注册表发现 |
| M4 | i18n(中英)、空态/错误态打磨、README、发布 GitHub + npm、提 awesome-dsh-plugin 收录 PR | npm 可装,市场可见 |

## 8. 开放问题(需用户拍板)

1. **名字**:推荐 `dsh-skill-station`(npm 已确认可用),备选 `dsh-skill-dock`、`dsh-skillmate`。
2. **项目位置**:建议独立目录 `~/Documents/Code/dsh-skill-station`(独立 git 仓库,不混入 deepseek-harness checkout);本设计稿随后迁入。
3. **GitHub 账号**:仓库建在哪个账号/组织下?创建仓库与 push 需要 `gh` 授权或你手动建仓。
4. **npm 发布**:需要你本机 `npm login` 或提供发布方式(我不持有凭据)。
5. **范围确认**:v1 排除技能市场、AI 进化、zip 上传、在线编辑文件;有异议现在提。
