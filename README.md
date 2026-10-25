# DSH Skill Station 🧩

> DeepSeek Harness 的技能管理站：扫描 Claude / Codex / Cursor / Gemini 的技能库，一键导入、拖拽安装、全局与项目级管理——全部在侧边栏面板里完成。

## 为什么做这个

Agent 技能（Skill）生态正在爆发，但各家框架的技能散落在不同目录和格式里：

- 想给 DSH 装一个技能，要手动找、手动拷、手动配
- Claude Code / Codex / Cursor / Gemini 各自有技能库，互不打通
- 全局技能 vs 项目技能的边界管理混乱

DSH Skill Station 把这些收敛成**一个侧边栏面板**：扫描 → 选择 → 一键导入。

## 功能

- 🔍 **多源扫描**：自动发现本机 Claude / Codex / Cursor / Gemini 的技能库
- ⬇️ **一键导入**：看中的技能直接装进 DSH
- 🗂️ **全局/项目双级管理**：用户级技能与项目级技能分开展示、独立操作
- 🖱️ **拖拽安装**：拖进来就装好了
- 🧱 **侧边栏面板**：不打断当前工作流

## 安装

```bash
# 作为 DSH 插件安装（具体命令按你实际的安装方式补充）
dsh plugin add dsh-skill-station
```

## 技术栈

TypeScript · DSH 插件体系（Cordis 内核）

## 路线图

- [ ] 技能版本兼容性检查（engines.dsh 声明）
- [ ] 技能市场接入
- [ ] 技能差异对比视图

## License

MIT
