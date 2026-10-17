# Windows 代码签名

Inkdown 的 Release 安装包通过 [SignPath Foundation](https://signpath.org/) 获得免费代码签名（面向符合条件的开源项目）。CI 也保留了自备 PFX 证书的签名方式。

## 签名流程

`.github/workflows/ci.yml` 的 `package` 任务在推送 `v*` 标签时执行：

1. 构建 NSIS 安装版与便携版到 `releases/<version>/`。
2. 上传未签名的 `*.exe` 作为 GitHub Actions 产物。
3. 若配置了 `SIGNPATH_API_TOKEN`，提交 SignPath 签名请求并等待完成。
4. 用签名后的文件覆盖原文件，删除失效的 `*.blockmap`，刷新 `latest.yml` 中的哈希与大小。
5. 用 `Get-AuthenticodeSignature` 校验签名，再上传最终产物。

若同时配置了 `WINDOWS_CSC_LINK`，则改用证书直接签名，跳过 SignPath 步骤。

## SignPath 配置

1. 在 <https://signpath.org/apply> 提交项目申请。项目需公开、使用 OSI 认可的开源许可证、持续维护且已有可签名的发布形态。
2. 审核通过后登录 <https://app.signpath.io>，完成以下配置：
   - **Project**：关联 GitHub 仓库 `akiker233/Inkdown`，记录 project slug。
   - **Signing policy**：例如 `release-signing`，按需启用人工审批，并允许 `v*` 标签构建发起签名。
   - **Artifact configuration**：使用 [signpath-artifact-configuration.xml](signpath-artifact-configuration.xml)，它会对 GitHub Actions 产物 zip 内的所有 `.exe` 签名；记录 slug。
   - **API token**：创建可提交签名请求的令牌。
   - 记录 organization ID。
3. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加：
   - Secret：`SIGNPATH_API_TOKEN`
   - Variables：`SIGNPATH_ORGANIZATION_ID`、`SIGNPATH_PROJECT_SLUG`、`SIGNPATH_SIGNING_POLICY_SLUG`、`SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`
4. 推送新的 `v*` 标签验证整个流程。签名请求若需人工审批，请留意 SignPath 控制台；工作流最多等待 30 分钟。

## 本地验证

```powershell
Get-AuthenticodeSignature .\Inkdown-Setup-0.1.1-x64.exe | Format-List Status, SignerCertificate
```

`Status` 应为 `Valid`，签名者应为 SignPath Foundation。
