# 贡献指南

感谢你愿意为 Inkdown 贡献代码、文档或反馈。本文说明本地开发、代码约定与提交 Pull Request 的流程。

## 开始之前

- 缺陷报告和功能建议请使用 [Issue 模板](https://github.com/akiker233/Inkdown/issues/new/choose)。
- 安全问题请不要公开提交 Issue，按 [SECURITY.md](SECURITY.md) 的流程私下报告。
- 较大的功能或重构建议先开 Issue 讨论方向，避免重复实现或偏离项目目标。

## 开发环境

- Node.js 24（与 CI 一致）
- npm（仓库使用 `package-lock.json`）
- Windows 10 / 11 x64

```bash
npm ci
npm run dev
```

当前主要适配 Windows；Linux 与 macOS 尚未验证。涉及跨平台能力的改动请说明测试环境。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发模式 |
| `npm run typecheck` | 主进程与渲染进程类型检查 |
| `npm test` | 运行 Vitest 单元测试 |
| `npm run build` | 类型检查并构建到 `out/` |
| `npm run e2e` | 开发版端到端测试（需要先构建） |
| `npm run dist:dir` | 生成未打包目录 `releases/<version>/win-unpacked` |
| `npm run dist` | 生成 Windows 安装包到 `releases/<version>/` |
| `npm run e2e:packaged` | 打包版端到端测试 |

## 代码约定

### TypeScript

- 保持严格类型，避免 `any`；无法避免时请缩小作用范围并说明原因。
- 共享类型放在 `src/shared/`，不要在主进程和渲染进程各写一份。

### IPC

新增或修改 IPC 时，请同时更新以下位置，保持契约一致：

1. `src/shared/ipc/contract.ts`：请求 / 响应类型。
2. `src/shared/ipc/channels.ts`：通道名。
3. `src/shared/ipc/api.ts`：对外 API 类型。
4. `src/preload/index.ts`：`contextBridge` 暴露。
5. `src/main/ipc/`：主进程处理器与参数校验。
6. 渲染进程调用方与相关单元测试。

不要把 Node.js 能力直接暴露给渲染进程，也不要关闭 `contextIsolation` 或启用 `nodeIntegration`。

### 界面与文案

- 所有面向用户的文案同时补充 `src/renderer/src/i18n.ts` 中的中文与英文条目。
- 颜色、间距与字体使用 `src/renderer/src/styles/tokens.css` 中的变量，确保浅色与深色主题都可用。
- 组件样式优先复用现有类名与布局，避免引入与设计体系冲突的硬编码值。

### 编辑器与文件

- 文件读写、路径解析与外部程序调用只在主进程中执行。
- 涉及 Markdown 解析、表格模型、字数统计等纯逻辑时，优先拆成可测试的纯函数。
- 修改即时渲染行为时，请同时检查源码模式、IME 输入、表格与代码块边界。

## 测试

提交前至少运行：

```bash
npm run typecheck
npm test
npm run e2e
```

涉及界面或交互的改动，请在 Pull Request 中附上截图或录屏，并说明验证过的场景。涉及打包配置、文件关联或自动更新的改动，请额外运行 `npm run dist:dir` 与 `npm run e2e:packaged`。

## 分支与提交

- 从 `main` 创建分支：`feat/...`、`fix/...`、`docs/...`、`refactor/...`。
- 提交信息使用 Conventional Commits，例如：
  - `feat: add table alignment toolbar`
  - `fix: keep cursor stable while images load`
  - `docs: document Windows file association`
- 一个提交只做一件事；避免把格式化、重构与功能混在一起。

## Pull Request

请在 PR 描述中说明：

- 改动目的与用户可见行为。
- 相关 Issue 编号（如有）。
- 测试方式与结果。
- 是否影响 Windows 文件关联、默认应用、自动更新或打包体积。

提交前确认：

- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `npm run e2e` 通过
- [ ] 新增或修改的逻辑有对应测试
- [ ] 中英文文案均已补充
- [ ] 浅色与深色主题均检查过
- [ ] 没有提交 `node_modules/`、`release*/`、`.tmp/` 或本地设置文件

## 许可证

提交贡献即表示你同意以 [GPL-3.0](LICENSE) 许可证发布你的贡献。
