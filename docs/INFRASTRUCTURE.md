# Nexa 基础设施配置指南

本文档面向**开发者 / 运维**，说明如何部署 Nexa 搜索所需的后端基础设施。

最终用户不需要配置任何环境变量。

---

## SearXNG（网页搜索）

Nexa 的 Web Search、News Search、Image Search、Social Search（通过 site: 查询）均依赖自托管的 SearXNG 实例。

### 为什么不能使用公共实例

- 公共 SearXNG 实例不稳定，随时可能限流或下线
- Nexa 不对最终用户暴露 Provider 配置，搜索基础设施由产品方维护
- 公共实例无法满足生产环境的可用性与数据合规要求

### 部署步骤

#### 方式 A：Docker（推荐，Linux / macOS / 已安装 Docker Desktop 的 Windows）

**1. 使用 Docker 部署 SearXNG**

```bash
cd infra/searxng
docker compose up -d
```

默认监听 `http://localhost:8080`。配置文件位于 `infra/searxng/settings/settings.yml`，已启用 JSON API。

#### 方式 B：Windows 原生（无 Docker 时的开发环境）

如果本机未安装 Docker Desktop，可使用项目内置的 SearXNG for Windows：

```bat
infra\searxng-win\start-searxng.bat
```

- 运行地址：`http://localhost:8080`
- 基于真实 SearXNG 源码（非 Mock）
- 已启用 JSON API 和常用搜索引擎（Google、Bing、Baidu、Sogou 等）

**2. 验证 JSON API**

```bash
curl "http://localhost:8080/search?q=test&format=json"
```

正常响应应包含 `results` 数组，每条结果有 `title`、`url`、`content` 字段。

**3. 配置 Nexa**

在项目根目录 `.env` 中设置：

```
SEARXNG_BASE_URL=http://localhost:8080
```

**4. 重启 Nexa 开发服务器**

```bash
npm run dev
```

**5. 验证**

搜索任意关键词，Web 结果应正常返回。开启 `SEARCH_DEBUG=true` 可在服务端控制台查看 `providersCalled` 是否包含 `web`。

### 双轨检索说明

Nexa 会并行调用：

- **国内轨**：baidu / sogou（及小红书 site:）
- **国际轨**：yandex / bing（及 X、TikTok site:、维基百科）

任一轨失败时，另一轨结果仍会展示。

### 国际内容「在 Nexa 中打开」（类似 Yandex）

国内用户浏览器往往无法直连 X / Wikipedia / TikTok。Nexa 采用与 Yandex 相同思路：用户只访问 Nexa，由服务端抓取正文。

在 `.env` 配置出口代理后重启 `npm run dev`：

```
NEXA_FETCH_PROXY=http://127.0.0.1:7890
```

也兼容 `HTTPS_PROXY` / `HTTP_PROXY`。

| 能力 | 无代理 | 有代理 |
|------|--------|--------|
| 百度 / 小红书等国内结果 | 可用，可直连打开 | 可用 |
| Yandex/Bing 国际检索 | 视本机网络而定 | 更稳定 |
| X / Wiki / TikTok 站内打开 | 常失败 | 可用 |

验证：`curl "http://localhost:3000/api/read?url=https://zh.wikipedia.org/wiki/Artificial_intelligence"`

### 生产环境注意事项

- 建议通过反向代理（Nginx / Caddy）添加 HTTPS
- 限制 SearXNG 仅内网可访问，Nexa API 通过内网调用
- 配置 `limiter` 防止滥用

---

## YouTube Data API

用于视频类搜索（intent = video）。

### 配置步骤

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建项目
2. 启用 YouTube Data API v3
3. 创建 API Key（限制为服务器端 IP）
4. 在 `.env` 中设置：

```
YOUTUBE_API_KEY=your_api_key_here
```

### 验证

搜索「AI 眼镜评测视频」，开启 `SEARCH_DEBUG=true`，`providersCalled` 应包含 `youtube`，结果中应有 YouTube 视频卡片。

---

## AI Provider（Nexa 服务端统一接入）

用户**不能**配置任何 API Key。全部由 Nexa Server 环境变量管理。

优先使用国内 OpenAI 兼容接口（通过 `AI_BASE_URL`，不在 UI 暴露具体模型名）。

```
NEXA_AI_PRIMARY_PROVIDER=domestic_openai
AI_BASE_URL=https://your-domestic-endpoint/v1
AI_API_KEY=server_side_key_only
AI_MODEL_FAST=nexa-fast
AI_MODEL_MAIN=nexa-main
AI_MODEL_REASONING=nexa-reasoning
AI_MODEL_VISION=nexa-vision
AI_MODEL_EMBED=nexa-embed
NEXA_AI_REGION=cn

# 可选媒体能力（未设置则对应能力显示「暂未接入」，不伪造成功）
NEXA_IMAGE_ENABLED=0
NEXA_VIDEO_ENABLED=0
NEXA_MUSIC_ENABLED=0
NEXA_TTS_ENABLED=0
AI_MEDIA_BASE_URL=
AI_MEDIA_API_KEY=

# Credits 后台计价表（JSON）。未配置则不伪造预计消耗数字
NEXA_CREDITS_COST_TABLE={"generateText":2,"reason":3,"research":15,"analyzeImage":4,"qualityCheck":1}
```

架构：`AIOrchestrator` → `CapabilityRouter` → `ProviderRegistry` → Model。  
业务代码只调用能力，不依赖具体厂商/模型产品名。  
未来可切换：qwen / deepseek / doubao / gemini / openai（V2.1 只启用一个）。

Usage（requestId / userId / capability / provider / model / tokens / cost / credits / status）写入服务端 `.nexa-data/ai-usage/`（及可选 Prisma `AIUsageLog`），用户界面只看 **AI Credits**。

冒烟：`npm run ai:smoke`（「什么是 RAG？」）

### 验证

1. 配置 `AI_BASE_URL` + `AI_API_KEY` 后重启
2. 搜索应出现带引用的 AI Overview
3. 创作「AI 生成草稿」、工作区研究、Deep Research 应真实调用（非 Mock）
4. 未配置时各处显示「AI 服务暂未接入」，不伪造结果

---

## Wikipedia

无需配置。Nexa 直接调用 Wikipedia 公开 API（英文 + 中文）。

### 验证

搜索「什么是 RAG？」，应出现 Wikipedia Knowledge Card，标题为「Retrieval-augmented generation」，而非无关条目。

---

## Database（可选）

用于搜索历史持久化与工作区功能。

```
DATABASE_URL=postgresql://user:password@localhost:5432/nexa
```

```bash
npx prisma db push
```

未配置数据库时，搜索功能正常工作，工作区仅在当前会话内有效。

---

## Search Debug Mode

开发环境验收搜索质量时，在 `.env` 中设置：

```
SEARCH_DEBUG=true
```

服务端控制台将输出：

- `originalQuery` / `normalizedQuery`
- `intent` / `rewrittenQueries`
- `providersCalled` / `providerLatency`
- `resultsReturned` / `resultsFiltered`
- `providerErrors`

普通用户界面不会显示这些信息。生产环境务必设为 `false`。

---

## Provider 状态速查

| Provider | 环境变量 | 未配置时的行为 |
|----------|----------|----------------|
| Wikipedia | 无 | 始终可用 |
| SearXNG (Web) | `SEARXNG_BASE_URL` | 跳过 Web 搜索，不暴露错误给用户 |
| YouTube | `YOUTUBE_API_KEY` | 跳过视频搜索 |
| AI Overview | `AI_API_KEY` | 不显示 AI 概览 |
| Database | `DATABASE_URL` | 工作区仅会话内有效 |
