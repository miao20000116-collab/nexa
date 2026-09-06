# Nexa V2.3 — AI Content Creation Acceptance Report

> 验收时间：2026-09-02  
> 范围：多入口创作、自动上下文、中文结构化草稿、字段级局部改写、高级 Prompt、Credits 记账、状态持久化  
> **未进入** Image / Video 产品化深化；Publishing 仅保留既有面板

---

## 1. 总体结论

**代码与产品闭环：通过**  
**真实 LLM 生成 / 局部改写端到端：阻塞（`.env` 未配置 `AI_BASE_URL` + `AI_API_KEY`）**

| 项 | 状态 |
|---|---|
| 多入口（idea / search / workspace / assets / link / commerce） | ✅ Hub + 深链 |
| 自动上下文（工作区 / 素材 / 诊断 / 搜索） | ✅ `context-assembler` |
| 统一中文字段（标题 / Hook / 正文 / 结构 / CTA / Hashtags / 封面建议） | ✅ |
| 字段级局部改写（非整篇重生成） | ✅ `rewrite_field` + `resolveFieldForAction` |
| 高级 Prompt（可编辑、默认隐藏） | ✅ `save_prompt` |
| 状态：draft → generating → ready / editing / completed / failed / blocked | ✅ |
| Credits 记账（无充值、无 Key/Model 暴露） | ✅ 经 AIGateway |
| 商业诊断 → 创作深链 `mode=commerce` | ✅ Amazon / TikTok |
| Lint / Typecheck / Build | ✅ PASS（lint 0 errors） |
| 真实 AI 出稿 | ⏸ 未配置 Key → 诚实 `blocked_ai_unavailable` / 登录门槛 |

---

## 2. 入口与上下文

| 入口 | 行为 |
|---|---|
| 想法 | 直接目标 + 平台 / 类型 |
| 搜索 | `/search`「基于此搜索去创作」→ 可选工作区 |
| 工作区 | 必选工作区，自动拉资料 |
| 素材 | 素材库「去创作」可带 `assetIds` |
| 链接 | 粘贴 URL 作为来源 |
| 商品诊断 | `commerceContext` 写入 sources + brief，无需复制粘贴 |

实现要点：

- `src/modules/create/services/context-assembler.ts`
- `src/lib/creation/file-store.ts` 与 Prisma 路径均支持 `commerceContext` / `promptOverride`
- API：`POST /api/create` 接受 `commerceContext`、`promptOverride`

---

## 3. 生成与局部编辑

```
目标 + 上下文 → System Prompt（内置中文 JSON 或高级覆盖）
→ generateText → 合并 UnifiedContent → status=ready

单字段 → rewrite / generateText 回退 → 仅更新该字段 → status=editing
```

字段动作：

- 优化标题 → 只动 `title`
- 更自然 / 更专业 / 缩短 / 增加信息密度 → 当前字段
- 重新生成封面建议 → `coverSuggestion`（已修正旧 `coverText`）

工作台：

- 结构化字段编辑 + 预览
- 「AI 生成草稿」「标记完成」
- 侧栏「高级 Prompt」展开保存
- Credits / 未接入提示文案诚实

---

## 4. Smoke 证据

命令：`npm run ai:smoke:v23`（需本地 `next dev`）

产物：`.nexa-data/ai-tests/v2.3-creation-smoke.json`

预期（无 Key / 未登录时）：

- 创建 commerce 项目成功，`sources` 含 `commerce`
- `content` 含统一字段键
- `generate` / `rewrite_field` 返回 `login_required` 或 `blocked_ai_unavailable`（不伪造草稿）
- `save_prompt` / `mark_completed` 可持久化

配置 `AI_BASE_URL` + `AI_API_KEY` 并登录后，可复跑 smoke 验证真实出稿与局部改写。

---

## 5. 明确未做（按范围）

- Image / Video 能力产品化深化
- Publishing 发布链路扩展
- Credits 充值 / 扣费 UI

---

## 6. 阻塞与下一步

**阻塞：** `.env` 中 `AI_BASE_URL` / `AI_API_KEY` 为空。

**下一步（用户提供 Key 后）：**

1. 登录后跑 `npm run ai:smoke:v23`
2. 手工验收：commerce 深链 → 生成 → 只改标题 → 标记完成
3. 进入下一版本能力（若需要 Image/Video/Publish）
