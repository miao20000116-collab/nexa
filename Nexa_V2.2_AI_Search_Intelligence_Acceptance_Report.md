# Nexa V2.2 — AI Search Intelligence Acceptance Report

> 验收时间：2026-09-02  
> 范围：AI Overview grounding、Deep Research Job、中文报告、Credits usage  
> **未进入** Image / Video / Publishing

---

## 1. 总体结论

**代码与产品闭环：通过**  
**真实 LLM Overview / Research 端到端：阻塞（`.env` 未配置 `AI_BASE_URL` + `AI_API_KEY`）**

| 项 | 状态 |
|---|---|
| AI Overview 管线（Context Builder → LLM → 引用过滤） | ✅ 已实现 |
| Grounding（禁止无来源结论） | ✅ `sourceIds` 必须命中真实搜索结果 id |
| Deep Research Job 状态机 | ✅ queued → running → completed / failed / blocked |
| 中文报告分区 | ✅ 结论 / 发现 / 证据 / 趋势 / 竞争 / 机会 / 风险 / 来源 |
| 不展示 Chain of Thought | ✅ meta/reasoning 已剥离 |
| 继续创作 / 工作区入口 | ✅ 报告面板链接 |
| Credits（token 记账 → Credits，UI 不露 Key/Model） | ✅ usage log + cost table |
| Lint / Typecheck / Build | ✅ PASS（lint 0 errors） |
| 「什么是 RAG？」真实 AI Overview | ⏸ AI 未配置 → UI 诚实显示「AI 概览暂未接入」 |
| 「研究美国 AI 眼镜市场」真实报告 | ⏸ `blocked_ai_unavailable` |

---

## 2. AI Overview

### 流程

```
User Query → Search → Relevant Sources → Context Builder → LLM → Grounded Answer
```

| 文件 | 作用 |
|---|---|
| `src/modules/ai/overview/context-builder.ts` | 选源、拼上下文、过滤无引用 points |
| `src/modules/ai/router/ai-gateway.ts` | `generateOverview` |
| `src/modules/search/components/ai-overview.tsx` | 「Nexa AI」卡片 |

### Grounding 规则

- 只能基于搜索结果作答  
- 每个 point 必须带合法 `sourceIds`  
- 禁止编造 URL  
- 无 AI 时：**不伪造**，显示「AI 概览暂未接入」

---

## 3. Deep Research

### Job 状态

`queued` → `running` → `completed` | `failed` | `blocked_ai_unavailable`

### 管线

```
Query → Planning → Multi Search → Dedup → Relevance → Evidence → Synthesis → Report
```

实现：`src/modules/ai/research/deep-research.ts`  
归一化：`src/modules/ai/research/normalize-report.ts`  
UI：`ResearchReportPanel` + 工作区轮询（2.5s）

### 报告中文分区（仅最终结论，无 CoT）

研究结论 · 核心发现 · 证据 · 市场趋势 · 竞争情况 · 机会 · 风险 · 来源

### 下游

- 「在工作区查看」
- 「继续创作」→ `/create?mode=workspace&workspaceId=…`

---

## 4. Credits

- 每次 AI 调用写入 usage（tokens / status）到 `.nexa-data/ai-usage/`
- `NEXA_CREDITS_COST_TABLE` 转换为 Credits 记账（需登录 userId）
- 用户侧只见 Credits，不暴露 Provider / API Key / Model

---

## 5. 实测证据

### 5.1 搜索「什么是 RAG？」

- 浏览器：`http://localhost:3000/search?q=什么是%20RAG？`
- 结果均为 RAG / 检索增强生成相关（无无关噪声如政治人物）
- Nexa AI 卡片：**「AI 概览暂未接入」**（诚实空态，因密钥未配）
- 截图：`.nexa-data/ai-tests/v2.2-rag-search-overview.png`（若已保存）/ 浏览器实测快照

### 5.2 Smoke：`npm run ai:smoke:v22`

```
aiReady: false
ragGrounded: false
researchStatus: blocked_ai_unavailable
```

证据文件：

- `Nexa_V2.2_AI_Search_Intelligence_Test_Result.md`
- `.nexa-data/ai-tests/v2.2-search-intelligence.json`

### 5.3 Wikipedia

偶发超时（5s→已调至 8s）。Web 结果仍保持 RAG 相关；direct lookup 在网络正常时可用。

---

## 6. 复测条件（需你提供密钥）

在服务端 `.env`（禁止 `NEXT_PUBLIC_*`）：

```
AI_BASE_URL=https://your-domestic-endpoint/v1
AI_API_KEY=***
AI_MODEL_MAIN=your-model
AI_MODEL_FAST=your-fast-model
```

然后：

```
npm run ai:smoke:v22
```

期望：

1. Overview `grounded: true`，含引用  
2. Deep Research `status: completed`，含中文结论与真实 URL 来源  

登录后发起「研究美国 AI 眼镜市场」可在工作区看到完整报告并进入创作。

---

## 7. Build

```
npm run lint      → PASS（0 errors）
npm run typecheck → PASS
npm run build     → PASS
```

---

*V2.2 产品代码已完成；真实 LLM 端到端结果待服务端密钥配置后复测。*
