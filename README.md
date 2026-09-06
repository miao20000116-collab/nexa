# Nexa — AI Workflow（Search → 研究/工作区 → AI 创作 → 发布/经营回流）

Next.js 16 + Prisma（PostgreSQL）单体应用。开发默认可用本地 `.nexa-data` 兜底；**生产 / Netlify 必须使用数据库与对象存储**。

## 本地开发

```bash
npm ci
cp .env.example .env   # 按需填写；无 DATABASE_URL 时走本地文件兜底
npm run dev
```

常用脚本：`npm run typecheck` · `npm run lint` · `npm run build`

## 生产部署

**顺序建议：先 Netlify 海外预览 → 再腾讯云国内主站。**

| 环境 | 文档 | 说明 |
|------|------|------|
| **Netlify 预览** | [`deploy/NETLIFY.md`](./deploy/NETLIFY.md) | 构建次数有限：本地全绿 + 环境变量齐备后再 Deploy |
| **腾讯云生产** | [`deploy/README.md`](./deploy/README.md) | Docker Compose + Nginx + HTTPS + Worker + COS |
| 环境变量模板 | [`.env.production.example`](./.env.production.example) | 只含变量名与说明，无真实密钥 |

### Netlify（一次成功要点）

1. 本地：`npm run typecheck && npm run lint && npm run build`  
2. 准备 Postgres，执行 `npx prisma migrate deploy`  
3. 在 Netlify UI 写入 `DATABASE_URL`、`NEXT_PUBLIC_APP_URL`、`AUTH_SECRET` 等  
4. 再关联仓库部署；部署后检查 `/api/health?deep=1`  

Netlify **不应**作为中国大陆唯一生产入口。

### 腾讯云（摘要）

```bash
cp .env.production.example .env.production  # 填写密钥
chmod +x deploy/scripts/*.sh
./deploy/scripts/deploy.sh up
# 配置 nginx/nexa.conf + certbot
```

健康检查：`GET /api/health`（`?deep=1` 含 DB / 对象存储 / SearXNG 探测，不泄露密钥）。

## 架构要点

- Web：Next.js（Netlify OpenNext 或 Docker `standalone`）  
- DB：PostgreSQL（Prisma migrate）  
- 媒体：S3 / 腾讯云 COS 兼容层（`src/lib/storage`）  
- 搜索：SearXNG 独立容器，仅内网  
- 长任务：腾讯云 `worker` 服务（Netlify 上受函数超时限制）  

## 安全提醒

- 勿提交 `.env` / `.env.production`  
- AI Key、OAuth Secret 仅服务端环境变量  
- Commerce 演示数据带 `isDemo` 标记，不可伪装成实时店铺数据  
