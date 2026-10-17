## 改动说明

简要说明这个 PR 做了什么，以及用户可见的行为变化。

## 关联 Issue

Closes #

## 验证方式

请说明如何验证本次改动，并附上必要的截图或录屏。

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run e2e`
- [ ] 涉及打包 / 文件关联 / 自动更新时：`npm run dist:dir` 与 `npm run e2e:packaged`

## 检查项

- [ ] 新增或修改的逻辑有对应测试
- [ ] 中英文文案均已补充
- [ ] 浅色与深色主题均检查过
- [ ] 未提交 `node_modules/`、`release*/`、`.tmp/` 或本地设置文件
- [ ] 未降低渲染进程安全设置（`contextIsolation` / `nodeIntegration`）
