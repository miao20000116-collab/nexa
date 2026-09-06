# Nexa 部署指南（Netlify 预览优先 → 腾讯云生产）

> **重要**：中国大陆生产主站应部署在腾讯云。Netlify 仅作海外/预览环境，且构建次数有限——**务必本地验证通过后再点 Deploy**。

完整检查清单与命令见下文；环境变量模板见仓库根目录 `.env.production.example`。

---

## 0. 推荐上线顺序

1. **本地**：`npm run typecheck && npm run lint && npm run build` 全绿  
2. **准备 Postgres**（Neon / Supabase / Prisma Postgres）并拿到 `DATABASE_URL`  
3. **Netlify**：先配齐环境变量 → 再关联仓库 → **只部署一次**  
4. **腾讯云**：Docker Compose + Nginx + HTTPS + COS + Worker（国内主站）

---

## 1. Netlify 一次部署成功清单（必读）

### 1.1 本地必须先绿

```bash
npm ci
npm run typecheck
npm run lint
npm run build
```

任一失败都不要点 Netlify Deploy。

### 1.2 部署前在 Netlify UI 配好的变量（至少）

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | **必填**。Serverless 无本地 `.nexa-data`，无库则会话/工作区不可持久 |
| `NEXT_PUBLIC_APP_URL` | 站点 URL，如 `https://xxx.netlify.app` |
| `NEXA_RUNTIME` | 设为 `serverless`（`netlify.toml` 已带） |
| `NEXA_REQUIRE_DATABASE` | `1` |
| `NEXA_ALLOW_LOCAL_DATA` | `0` |
| `AUTH_SECRET` / `SESSION_SECRET` | 长随机串 |
| `SEARXNG_BASE_URL` | **公网可达**的 SearXNG（不要填 localhost） |
| `AI_BASE_URL` / `AI_API_KEY` / 模型名 | 国内可用 OpenAI 兼容网关 |
| `S3_*` 或 `COS_*` | 强烈建议；否则生成的图片/视频在 Serverless 上会丢 |

完整列表：`.env.production.example`。

### 1.3 Netlify 站点设置

- Build command: `npm run build`（已由 `netlify.toml` 指定）  
- Publish directory: `.next`  
- Node: `22`  
- **不要**设置 `DOCKER_BUILD=1`（那是腾讯云镜像用的）  
- 插件：使用 Netlify 自动 OpenNext；勿随意 pin 旧版 `@netlify/plugin-nextjs`  

### 1.4 Prisma / 迁移

首次有可用 `DATABASE_URL` 后，在本机或 CI 执行：

```bash
npx prisma migrate deploy
```

Netlify build 会 `prisma generate`，但**不会**自动 migrate。请在第一次部署前对目标库执行 migrate。

### 1.5 Netlify 能力边界（预期，不是失败）

| 能力 | Netlify 预览 | 说明 |
|------|--------------|------|
| 页面 / API | ✅ | OpenNext |
| 搜索 | ⚠️ | 需公网 SearXNG |
| 登录/工作区 | ✅ | 需 Postgres |
| 长视频 / Worker | ❌/弱 | 函数超时；完整 worker 放腾讯云 |
| 媒体持久化 | ⚠️ | 需 COS/S3 |
| 中国大陆稳定访问 | ❌ | 不要作为国内唯一入口 |

### 1.6 部署后立刻检查

```bash
curl -sS "https://YOUR_SITE.netlify.app/api/health?deep=1"
```

期望：`ok: true`，`checks.database.status` 为 `ok`。

---

## 2. 腾讯云生产（国内主站）

### 2.1 最低推荐配置

| 资源 | 最低 | 建议 |
|------|------|------|
| CVM | 4 核 8GB，50GB SSD | 8 核 16GB（含视频任务） |
| 带宽 | 5Mbps | 10Mbps+ |
| 系统 | Ubuntu 22.04 LTS | 同左 |
| 对象存储 | COS 标准存储 | 同左 |
| 域名 | 已备案（若面向大陆） | HTTPS |

### 2.2 Ubuntu 初始化（摘要）

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates nginx certbot python3-certbot-nginx
# Docker: 按官方文档安装 docker + docker compose plugin
sudo usermod -aG docker "$USER"  # 重新登录生效
```

### 2.3 域名

- DNS A 记录指向 CVM 公网 IP  
- 安全组放行 80/443（不要对公网开放 5432、6379、8080/SearXNG）

### 2.4 首次部署

```bash
git clone <YOUR_REPO> nexa && cd nexa
cp .env.production.example .env.production
# 编辑 .env.production：POSTGRES_PASSWORD、COS、AI、域名等
chmod +x deploy/scripts/*.sh
./deploy/scripts/deploy.sh up
```

Nginx：

```bash
sudo cp nginx/nexa.conf /etc/nginx/sites-available/nexa.conf
# 把 YOUR_DOMAIN 替换成真实域名
sudo ln -sf /etc/nginx/sites-available/nexa.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your.domain -d www.your.domain
```

### 2.5 常用运维

```bash
./deploy/scripts/deploy.sh pull      # 拉代码、构建、迁移、滚动 web/worker
./deploy/scripts/deploy.sh logs
./deploy/scripts/deploy.sh restart
./deploy/scripts/backup-postgres.sh
./deploy/scripts/restore-postgres.sh backups/postgres/nexa_XXXX.sql.gz
./deploy/scripts/health-check.sh https://your.domain
```

### 2.6 可选 systemd

若不用 Compose 守护，可为 `docker compose up` 写 systemd unit；推荐直接依赖 Compose `restart: unless-stopped`。

### 2.7 备份策略

- Postgres：每日 `backup-postgres.sh`，保留 ≥14 天，异地拷贝一份  
- COS：开启版本控制 + 跨区域复制（控制台）  
- 密钥：仅存环境变量 / 密钥管理，不进 Git  

### 2.8 国内 AI / 搜索

- `NEXA_AI_PRIMARY_PROVIDER=domestic_openai` + 国内兼容网关  
- 或 Qwen / DeepSeek 覆盖变量  
- SearXNG 用 Compose 内网服务；`SEARXNG_BASE_URL=http://searxng:8080`  
- 即梦：配置 `JIMENG_*` 且 `NEXA_VIDEO_ENABLED=1`（未配置须优雅降级，禁止假成功）

---

## 3. Netlify 与腾讯云并存时的 API Origin

- Netlify 站点：`NEXT_PUBLIC_APP_URL=https://preview.example.netlify.app`  
- 若预览站调用腾讯云 API：`NEXT_PUBLIC_API_ORIGIN=https://api.your-domain.com`（需 CORS）  
- **大陆用户主入口必须是腾讯云域名**，Netlify 只给海外预览 / 演示  

---

## 4. 上线前检查清单

- [ ] 本地 typecheck / lint / build 通过  
- [ ] `DATABASE_URL` 已 migrate  
- [ ] 无真实密钥进仓库  
- [ ] Commerce 响应含 `isDemo` 标记  
- [ ] `/api/health?deep=1` 正常  
- [ ] 访客可搜索；Commerce / 发布 / OAuth 需登录  
- [ ] 未配置的 AI 能力显示不可用，而非“成功”  
- [ ] SearXNG 未对公网裸奔  
- [ ] HTTPS 与证书自动续期  

## 5. 上线后监控清单

- [ ] `/api/health` 定时探测  
- [ ] Nginx / Docker 日志  
- [ ] Postgres 备份是否成功  
- [ ] AI / 即梦错误率与额度  
- [ ] 磁盘与 COS 用量  
- [ ] Certbot 续期  

---

## 6. CI 示例

见 `.github/workflows/deploy-example.yml`（默认手动触发，避免消耗 Netlify 次数）。
