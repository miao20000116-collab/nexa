# Netlify 预览部署 — 一次性成功操作卡

**在点击 Netlify「Deploy」之前，请按顺序完成以下全部步骤。构建次数有限。**

## A. 本地验证（必须全绿）

```bash
cd "Nexa搜索引擎"
npm ci
npm run typecheck
npm run lint
npm run build
```

## B. 准备 Postgres（必须）

任选其一创建空库，复制连接串为 `DATABASE_URL`：

- Neon / Supabase / Prisma Postgres（海外预览常用）
- 腾讯云 PostgreSQL（若预览也连国内库，注意延迟与白名单）

在本机对**即将用于 Netlify 的库**执行：

```bash
# PowerShell
$env:DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB?sslmode=require"
npx prisma migrate deploy
```

确认 migrate 成功后再继续。

## C. Netlify 环境变量（Deploy 前写入 Site settings → Environment variables）

最少必填：

```
NODE_ENV=production
NEXA_RUNTIME=serverless
NEXA_REQUIRE_DATABASE=1
NEXA_ALLOW_LOCAL_DATA=0
DATABASE_URL=（上一步的连接串）
NEXT_PUBLIC_APP_URL=https://<你的站点>.netlify.app
AUTH_SECRET=（至少 32 位随机）
SESSION_SECRET=（至少 32 位随机）
```

按需填写（未填应优雅降级，不要期望功能“假成功”）：

```
SEARXNG_BASE_URL=
AI_BASE_URL=
AI_API_KEY=
AI_MODEL_FAST=
AI_MODEL_MAIN=
NEXA_AI_PRIMARY_PROVIDER=domestic_openai
NEXA_IMAGE_ENABLED=1
NEXA_VIDEO_ENABLED=0
S3_ENDPOINT= / COS_* =
```

完整说明见 `.env.production.example`。

## D. Netlify 站点构建设置

- Repository 连接正确分支  
- Build command：使用仓库内 `netlify.toml`（`npm run build`）  
- Publish：`.next`  
- Node 22  
- **不要**设 `DOCKER_BUILD=1`  

## E. 第一次 Deploy 之后

```bash
curl -sS "https://<你的站点>.netlify.app/api/health?deep=1"
```

- `ok: true` 且 `database: ok` → 基础成功  
- `database: error` → 检查 `DATABASE_URL` / 白名单 / migrate，**修环境变量后 Clear cache and deploy**（这会再耗一次构建，故务必第一次就配好）

## F. 明确不做的事

- 不要把 Netlify 当作中国大陆唯一生产入口  
- 不要在未配数据库时部署（数据会丢 / 功能异常）  
- 不要期望长视频 Worker 在 Netlify 上稳定跑完 — 放到腾讯云 `worker` 服务  
