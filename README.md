# Release Watch

Release Watch 是一个轻量级的工具，用于监控指定的 GitHub 仓库发布（Release），并在检测到新版本时通过 Bark App 推送通知到你的手机。

支持两种运行模式：

1. **GitHub Actions**（传统模式）：依赖 GitHub 的定时任务运行。
2. **Cloudflare Workers**（推荐模式）：利用 Cloudflare 的 Serverless 能力和 D1 数据库，更加稳定且易于管理。

## 前置准备

在使用本项目之前，你需要准备：

1. **Bark App**: 安装在你的 iOS 设备上，并获取你的 `BARK_KEY`（打开 App 即可看到链接中的 Key）。
2. **GitHub Token**: 在 GitHub Settings -> Developer settings -> Personal access tokens 中生成一个 Token，权限至少需要 `public_repo`（如果监控私有仓库则需要 `repo`）。
3. **Cloudflare 账号**（仅 Cloudflare 模式需要）：注册并登录 Cloudflare。

---

## GitHub 操作指南 (Legacy)

如果你选择使用 GitHub Actions 运行脚本（对应 `poll.mjs`）：

1. **Fork 本仓库**到你的 GitHub 账号。
2. **配置 Secrets**：
    * 进入仓库 Settings -> Secrets and variables -> Actions。
    * 添加以下 Repository secrets：
        * `BARK_KEY`: 你的 Bark 推送 Key。
        * `GH_TOKEN`: 你的 GitHub Personal Access Token。
        * `NOCODB_TOKEN`: (旧版依赖) NocoDB 的 Token。
3. **启用 Action**：
    * 进入 Actions 标签页，确保 Workflow 已启用。

> [!WARNING]
> **关于 60 天停止运行规则**
> GitHub Actions 有一个机制：如果仓库在 60 天内没有任何提交（Commit），定时任务（Cron）将会自动停止运行。
>
> * **解决方法**：你需要每隔不到 60 天手动提交一次代码（例如修改 README 或添加空提交），或者点击 Actions 页面上的 "Enable workflow" 按钮来重新激活它。

---

## Cloudflare 部署操作指南 (推荐)

使用 Cloudflare Workers 部署，无需担心 60 天停止问题，且响应更快。

### 1. 环境配置

确保本地安装了 Node.js，并安装 Wrangler CLI：

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
npx wrangler login
```

### 3. 创建数据库

我们需要一个 D1 数据库来存储监控列表：

```bash
npx wrangler d1 create release-watch-db
```

*执行后，请记下控制台输出的 `database_id`。*

### 4. 修改配置

打开 `wrangler.toml` 文件，填入上一步获取的 `database_id`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "release-watch-db"
database_id = "你的-database-id" # <--- 替换这里
```

### 5. 初始化数据库

将表结构应用到远程数据库：

```bash
npx wrangler d1 execute release-watch-db --file=./schema.sql --remote
```

### 6. 设置密钥

将敏感信息安全地存储到 Cloudflare：

```bash
npx wrangler secret put BARK_KEY
# 输入你的 Bark Key

npx wrangler secret put GH_TOKEN
# 输入你的 GitHub Token

npx wrangler secret put BARK_SERVER
# 输入你的 Bark 服务器地址 (例如: https://bark.example.com)
```

### 7. 部署

```bash
npx wrangler deploy
```

### 8. 使用方法

部署成功后，你可以通过 API 管理你的监控列表：

* **添加监控仓库**：

    ```bash
    curl -X POST https://<你的worker域名>/repos -d '{"owner":"facebook", "repo":"react"}'
    ```

* **查看监控列表**：

    ```bash
    curl https://<你的worker域名>/repos
    ```

* **手动触发检查**：

    ```bash
    curl https://<你的worker域名>/trigger
    ```
