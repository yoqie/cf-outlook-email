# 使用 GitHub Actions 自动部署

适合已经能本地部署成功、希望以后 **push 到 main 就自动更新线上** 的场景。

> 本地首次部署仍建议先看 [详细部署教程](./GUIDE.md) 完成：创建 D1、设置 `ADMIN_PASSWORD` / `COOKIE_SECRET`、至少成功 deploy 一次。

## 1. 准备 GitHub Secrets

打开你的仓库（例如 `yoqie/cf-outlook-email`）→ **Settings** → **Secrets and variables** → **Actions** → **New repository secret**。

| Secret 名称 | 必填 | 说明 |
|-------------|:----:|------|
| `CLOUDFLARE_API_TOKEN` | ✅ | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | Cloudflare 账户 ID |
| `CF_D1_DATABASE_ID` | ⚠️ | D1 的 `database_id`。若仓库**没有**提交 `wrangler.toml`，则必须设置 |

### 1.1 创建 API Token

1. 打开 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create Token** → 使用 **Edit Cloudflare Workers** 模板（或自定义）
3. 权限至少包含：
   - Account → Workers Scripts → Edit
   - Account → D1 → Edit
   - Account → Account Settings → Read（如模板需要）
4. 创建后复制 Token，填到 GitHub Secret `CLOUDFLARE_API_TOKEN`

### 1.2 获取 Account ID

Cloudflare 仪表盘右侧 / Workers 概览页可见 **Account ID**，填到 `CLOUDFLARE_ACCOUNT_ID`。

### 1.3 获取 D1 database_id

本地曾创建过库的话：

```bash
pnpm exec wrangler d1 list
```

或看你本地 `wrangler.toml` 里的：

```toml
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

把这个值填到 GitHub Secret `CF_D1_DATABASE_ID`。

> 也可以直接把填好 `database_id` 的 `wrangler.toml` 提交进仓库（注意不要提交密码类 Secret）。若已提交 `wrangler.toml`，`CF_D1_DATABASE_ID` 可不设。

## 2. 确认工作流文件存在

仓库应有：

```text
.github/workflows/deploy-cloudflare.yml
```

触发条件：

- `push` 到 `main`
- 或 Actions 页面手动 **Run workflow**

工作流会：

1. 安装依赖
2. 如无 `wrangler.toml` 则用 `CF_D1_DATABASE_ID` 生成
3. TypeScript 检查
4. 远程 D1 迁移
5. `wrangler deploy`

## 3. 推送代码自动部署

```bash
git add -A
git commit -m "feat(external): add email detail API + Actions deploy"
git push origin main
```

然后打开：

```text
https://github.com/<你的用户名>/cf-outlook-email/actions
```

等待 **Deploy to Cloudflare Workers** 变为绿色勾。

## 4. 手动再部署（不改代码）

GitHub → **Actions** → **Deploy to Cloudflare Workers** → **Run workflow** → 选 `main` → Run。

## 5. 部署后验证对外 API

把域名和 Key 换成你的：

```bash
# 列表
curl "https://你的域名/api/external/emails?email=你的邮箱&key=你的Key&folder=all&top=5"

# 详情（id 来自列表返回）
curl "https://你的域名/api/external/emails/detail?email=你的邮箱&id=消息ID&key=你的Key"
```

- 列表应返回 `success: true`
- 详情应返回 `body` 完整正文（不再是 401「请先登录」）

更完整的字段说明见 [对外 API 文档](./API.md)。

## 6. 常见问题

### `pnpm failed with exit code 1` / Action failed

常见于旧版工作流使用 `cloudflare/wrangler-action` 时，它会**再次**调用 pnpm 安装，和仓库锁文件冲突。

当前工作流已改为：

1. `corepack` 启用 pnpm  
2. `pnpm install --frozen-lockfile`  
3. 直接 `pnpm exec wrangler ...` 迁移并部署  

若仍失败，打开失败 step 日志确认是：

- **Install dependencies**：锁文件不一致 → 本地 `pnpm install` 后提交 `pnpm-lock.yaml`
- **Ensure wrangler.toml**：缺 `CF_D1_DATABASE_ID` 或 `wrangler.toml`
- **Apply D1 migrations**：Token 没有 D1 权限，或 database_id 错误
- **Deploy Worker**：Token 没有 Workers 编辑权限

### Actions 绿了，但 detail 仍 401


1. 确认本次 Deploy 的 commit 里 `src/routes/external.ts` **包含** `external.get('/emails/detail'`
2. 打开该次 workflow 日志，确认 Deploy 步骤成功且 worker 名称是你的线上项目
3. 浏览器强刷 / 稍等数秒后再测（一般 Workers 即时生效）

### Ensure wrangler.toml 失败

- 仓库没有 `wrangler.toml`
- 且没设置 Secret `CF_D1_DATABASE_ID`

解决：补 Secret，或提交一份正确的 `wrangler.toml`。

### D1 / Deploy 权限失败

检查 `CLOUDFLARE_API_TOKEN` 是否有 Workers + D1 编辑权限，以及 `CLOUDFLARE_ACCOUNT_ID` 是否正确。

### 登录后台密码

Actions **不会**设置 `ADMIN_PASSWORD` / `COOKIE_SECRET`。  
若是新 Worker，需本地执行：

```bash
pnpm exec wrangler secret put ADMIN_PASSWORD
pnpm exec wrangler secret put COOKIE_SECRET
```

## 7. 推荐日常流程

1. 本地改代码
2. `git push origin main`
3. 等 Actions 自动部署
4. 用 API 文档里的 curl 验证列表 + 详情
