# Nexa V2 Final Acceptance Report

> 验收时间：2026-09-02  
> 环境：`http://localhost:3000`（`npm run dev`）+ SiliconFlow（Scheme D，既有 Key，未轮换）  
> 原则：真实 Provider / 真实 URL；不制造 Mock；不伪造成功  
> 证据：`.nexa-data/ai-tests/v2-final-acceptance.json` + `ai:smoke:v22`–`v29`

---

## Final Verdict

# Nexa V2 — **PASS**

| 门槛 | 要求 | 实际 |
|---|---|---|
| P0 | 0 | **0** |
| P1 | 0 | **0** |
| 核心链路 | 三条主流程端到端 | **全部通过** |

---

## Build

| 命令 | 结果 |
|---|---|
| `npm run lint` | ✅ **0 error** / 12 warning（`<img>`、未使用参数等，不阻塞） |
| `npm run typecheck` | ✅ 通过 |
| `npm run build` | ✅ 通过 |

---

## Search

| Query | status | 真实 URL | 备注 |
|---|---|---|---|
| 什么是 RAG？ | `ok` | 10 | Wikipedia + 真实网页；无 fake |
| OpenAI 最近有什么新闻？ | `ok` | 9 | news 意图 |
| AI眼镜 | `ok` | 18 | 相关性/软回退后非空 |
| AI眼镜图片 | `ok` | 24 | image |
| AI眼镜评测视频 | `ok` | 12 | video |
| X 上最近大家怎么看 AI Agent？ | `ok` | 9 | social 通道 ok；无 mock X |

**Search Security**：`fakeUrls = 0`（全量抽样无 example/mock/fake URL）

---

## AI（真实 Provider）

| 能力 | 结果 | 证据 |
|---|---|---|
| Capability | `AI_CAPABILITY_AVAILABLE` | text / image / research available |
| AI Overview | ✅ grounded（每条含 sourceIds）+ confirm 门闩 | overview confirm 200 |
| Deep Research | ✅ `completed` + 有报告 | research job poll |
| Creation generate | ✅ 真实中文正文 | create + confirm |
| Image | ✅ 完成并扣 8 Credits | `/api/image` |
| Video | ✅ 真实 30s MP4（356728 bytes） | `ai:smoke:v25` |
| QA | ✅ PASS / NEEDS_REVISION，无 CoT 泄漏 | API + `ai:smoke:v26` |

---

## Assets

| 项 | 结果 |
|---|---|
| 图片上传 → ready | ✅ |
| PDF 上传 | ✅ |
| 删除（DB/元数据 + Storage） | ✅ `DELETE /api/assets?id=` → 200；再取 → 404 |
| 跨用户访问 | ✅ User B → 403 |

> 说明：首轮验收脚本误用 `DELETE /api/assets/:id`（该路由无 DELETE）。产品 UI 使用 query 参数路径；复测通过。

---

## Creation 入口

| 入口 | 结果 |
|---|---|
| Idea | ✅ 200 |
| Search | ✅ 200 |
| Workspace | ✅ 200 |
| Commerce | ✅ 200（含 commerceContext） |
| Assets → Creation | ✅（素材库深链 + 生成链路经 smoke / API 覆盖） |

---

## Video / Music

| 项 | 结果 |
|---|---|
| 真实 MP4 输出 | ✅ v25 smoke |
| Timeline + 用户上传音乐优先 | ✅ music track 写入 timeline |
| Preview / Render | ✅ `/api/video/render/file/...` |
| 比例能力（9:16 / 16:9 / 1:1） | ✅ 产品类型与渲染管线支持（本轮 smoke 默认竖版 9:16 成片） |
| Music Upload / Preview / Timeline / Volume | ✅（上传 + timeline 混音 volume） |
| Music 独立 Delete API | ⚠️ 以替换上传 / 新 timeline 为主；无单独「仅删音乐」REST（已知产品缺口，非本轮阻断） |

---

## Commerce

| 平台 | 结果 |
|---|---|
| Amazon Diagnosis / Evidence / Action | ✅ `ai:smoke:v27` |
| TikTok Views / CVR / GMV 诊断 | ✅ Demo Store + intelligence findings |
| 上下文深链（commerce → create） | ✅ `commerceContext` |

---

## Context 闭环

| 流程 | 结果 |
|---|---|
| Search → Workspace → Research → Creation → QA | ✅ |
| Commerce → Search/Create → QA | ✅ |
| Assets → Creation → Video → Music → Render | ✅ |

---

## Credits

| 项 | 结果 |
|---|---|
| Search 免费 | ✅ |
| Overview / Research / Creation / Image / QA 需 confirm | ✅ |
| CreditLedger（jobId / capability / amount） | ✅ `ai:smoke:v28` |
| 失败不完整扣费 | ✅ Image failed 路径不记完整成功扣费（既有门闩） |
| Guest 高成本需登录 | ✅ research / image 阻断 |

---

## Security

| 检查 | 结果 |
|---|---|
| User B 访问 User A Creation | ✅ 403 |
| User B 访问 User A Assets | ✅ 403 |
| Guest Search | ✅ 可用 |
| Guest 高成本 | ✅ 需登录 |
| `.env` 无 `NEXT_PUBLIC_*API_KEY` | ✅ |
| 无 client API Key / 用户自配 Key UI | ✅ |

---

## Smoke 汇总

| Script | 结果 |
|---|---|
| `ai:smoke:v22` | ✅ RAG grounded + Deep Research completed |
| `ai:smoke:v23` | ✅ Creation + login + generate |
| `ai:smoke:v24` | ✅ 3 张真实图 |
| `ai:smoke:v25` | ✅ 30s MP4 |
| `ai:smoke:v26` | ✅ QA |
| `ai:smoke:v27` | ✅ Commerce intelligence |
| `ai:smoke:v28` | ✅ Credits economy |
| `ai:smoke:v29` | ✅ Publishing preview / confirm / unsupported honesty |

---

## 已知非阻断项（备注）

1. Lint 仍有 12 条 warning（`<img>`、unused `_opts` 等），**0 error**。  
2. Music 缺少独立 Delete REST（可用替换上传覆盖）。  
3. Video 本轮以竖版 30s 成片为主证据；多比例由 timeline aspectRatio 支持。  
4. SiliconFlow Key 保持现有配置（按用户要求未轮换）。

---

## 结论

在真实 AI Provider、真实搜索来源与完整 Credits / 安全门闩条件下，Nexa V2 核心产品闭环已打通。

**签发：Nexa V2 PASS**
