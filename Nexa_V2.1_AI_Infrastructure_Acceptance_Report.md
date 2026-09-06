# Nexa V2.1 — AI Infrastructure Acceptance Report

> 阶段目标：接入第一套真实 AI Provider（服务端统一管理）  
> 验收时间：2026-09-02  
> **未进入** Image / Video 产品化、Publishing

---

## 1. 总体结论

**基础设施通过；真实 LLM 调用待配置密钥后复测**

| 项 | 状态 |
|---|---|
| AIOrchestrator | ✅ |
| CapabilityRouter | ✅ Capability → Provider → Model |
| ProviderRegistry + Executor | ✅ |
| 国内主 LLM（OpenAI-compatible） | ✅ 代码就绪，env 未填密钥 |
| generateText / reason / analyzeImage | ✅ 已接 |
| generateImage / generateVideo | ✅ 能力位预留（本阶段不启用产品化） |
| 密钥仅服务端 | ✅ 无 NEXT_PUBLIC_*、无客户端暴露 |
| Usage 记录 | ✅ JSONL + Prisma 模型 `AIUsageLog` |
| Failure 分类 | ✅ timeout / rate_limit / error / unavailable |
| CreditLedger usage tracking | ✅（无充值系统） |
| Lint / Typecheck / Build | ✅ PASS |
| 「什么是 RAG？」真实回答 | ⏸ **blocked**：`.env` 未配置 `AI_BASE_URL` + `AI_API_KEY`（诚实阻断，无 fake） |

---

## 2. Architecture

```
业务 / API
    ↓
AIOrchestrator          （统一入口）
    ↓
CapabilityRouter        （Capability → Provider → Model）
    ↓
ProviderRegistry        （描述符 + 区域评分）
    ↓
ProviderExecutor        （实际 HTTP 调用）
    ↓
OpenAI-compatible API   （服务端 AI_BASE_URL / AI_API_KEY）
```

页面与客户端**绝不**指定 model / provider / API Key。

### 关键文件

| 模块 | 路径 |
|---|---|
| Orchestrator | `src/modules/ai/orchestrator/ai-orchestrator.ts` |
| CapabilityRouter | `src/modules/ai/router/capability-router.ts` |
| ModelRouter | `src/modules/ai/router/model-router.ts` |
| ProviderRegistry | `src/modules/ai/gateway/provider-registry.ts` |
| Executors | `src/modules/ai/gateway/provider-executors.ts` |
| Bootstrap | `src/modules/ai/gateway/bootstrap.ts` |
| Errors | `src/modules/ai/gateway/errors.ts` |
| Usage log | `src/modules/ai/gateway/usage-log.ts` |
| Text provider | `src/modules/ai/providers/openai-text-provider.ts` |
| Factory | `src/modules/ai/providers/provider-factory.ts` |
| Ask API | `src/app/api/ai/ask/route.ts` |
| Smoke | `scripts/ai-smoke-rag.ts` → `npm run ai:smoke` |

---

## 3. Provider 策略

- 本阶段启用：**一个**主 Provider（`NEXA_AI_PRIMARY_PROVIDER`，默认 `domestic_openai`）
- 业务代码**不写死** Qwen / DeepSeek / Doubao / Gemini / OpenAI 产品名
- Registry 已预留 stub，未来切换 `NEXA_AI_PRIMARY_PROVIDER` 即可扩展

---

## 4. Environment 安全

| 规则 | 验证 |
|---|---|
| 仅 Server Environment | ✅ `process.env.AI_*` |
| 禁止 NEXT_PUBLIC_*KEY | ✅ 无 |
| 禁止 localStorage / sessionStorage 存密钥 | ✅ |
| 禁止 HTML / client response 泄露 Key / Model | ✅ `/api/ai/ask` 仅返回 `answer` + `status` |

---

## 5. Usage 字段

每次成功/失败写入：

`requestId, userId, capability, provider, model, inputTokens, outputTokens, totalTokens, estimatedCost, creditsUsed, status, createdAt`

- 文件：`.nexa-data/ai-usage/{date}.jsonl`
- DB：`AIUsageLog`（Prisma，DB 可用时）

---

## 6. Failure

| 类型 | code | HTTP（Ask API） |
|---|---|---|
| Timeout | `ai_timeout` | 504 |
| Rate Limit | `ai_rate_limit` | 429 |
| Provider Error | `ai_error` | 502 |
| Unavailable | `ai_unavailable` | 503 |

禁止 fake success。

---

## 7. Credits

- `CreditLedger` 已存在
- `chargeCreditsForUsage` 按 `NEXA_CREDITS_COST_TABLE` 记账
- **无**充值 / 购买 UI（本阶段仅 usage tracking）

---

## 8. 冒烟测试：「什么是 RAG？」

命令：`npm run ai:smoke`

### 本次实测结果

```
status: blocked_ai_unavailable
configured: false
available: false
hardCoded: false
```

原因：当前 `.env` **未配置** `AI_BASE_URL` / `AI_API_KEY`。  
产品行为正确：**未伪造回答**。

证据文件：

- `Nexa_V2.1_AI_Smoke_Test_Result.md`
- `.nexa-data/ai-tests/v2.1-rag-smoke.json`

### 复测步骤（需你提供服务端密钥）

在 `.env` 写入（勿提交仓库）：

```
NEXA_AI_PRIMARY_PROVIDER=domestic_openai
AI_BASE_URL=https://your-endpoint/v1
AI_API_KEY=***
AI_MODEL_MAIN=your-model-id
AI_MODEL_FAST=your-fast-model-id
```

然后：

```
npm run ai:smoke
```

期望：`status: ok` + 真实中文回答 + usage 落盘。

---

## 9. Build

```
npm run lint      → PASS（0 errors）
npm run typecheck → PASS
npm run build     → PASS
npm run ai:smoke  → blocked_ai_unavailable（环境未配密钥）
```

---

## 10. 本阶段明确未做

- Image / Video 产品化与启用
- Publishing
- 多 Provider 并行 / 自动 failover
- Credits 充值系统

---

## 11. 阻塞项（需用户动作）

**请提供可用的国内 OpenAI 兼容 `AI_BASE_URL` + `AI_API_KEY`（及模型 ID）**，配置进服务端 `.env` 后重新运行 `npm run ai:smoke`，即可把本报告第 8 节更新为「真实 AI response 通过」。

---

*V2.1 AI Infrastructure 代码交付完成；真实 LLM 端到端冒烟待密钥配置。*
