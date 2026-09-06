# Nexa V2.8 — Credits Economy Acceptance Report

> 验收时间：2026-09-02  
> 范围：Credits 计价、确认消费、Ledger、访客策略（无订阅系统）

---

## 1. 总体结论

**通过**

| 项 | 状态 |
|---|---|
| Search（Web / News / Image / Video）免费 | ✅ |
| AI 消耗 Credits（Overview / Research / 创作 / 图 / 视频 / QA） | ✅ |
| 界面仅显示 Credits（无人民币 / Token） | ✅ |
| 预估 → 用户确认 → 执行 | ✅ |
| Ledger：userId · jobId · capability · credits · status | ✅ |
| AI 失败不扣完整 Credits（成功后才 charge） | ✅ |
| Guest：搜索 + 少量低成本 AI；Research / 图 / 视频需登录 | ✅ |
| 登录后 Credits 与 Workspace / Assets / Creation 绑定 | ✅ |
| 无复杂订阅（仅余额 + 流水） | ✅ |
| Smoke / Typecheck / Build | ✅ |

---

## 2. 计价表（服务端 `NEXA_CREDITS_COST_TABLE`）

| 能力 | Credits |
|---|---|
| AI Overview | 3 |
| Content Generation | 2 |
| Deep Research | 15 |
| Image Generation | 8 |
| Video Generation | 20 |
| QA | 1 |
| Rewrite | 2 |

---

## 3. 流程

```
Search（免费检索）
  → 可选 POST /api/search/overview（confirm → 扣 aiOverview）

AI 操作（创作 / QA / 图片 / Research / 视频）
  → gateAiUsage（登录规则 + 余额 + confirm）
  → AIOrchestrator 成功后才 chargeCreditsForUsage
  → Ledger 记录 jobId / capability / jobStatus
```

访客：`guest:{uuid}` 账户 + 15 Credits 体验额度。

---

## 4. Smoke 证据

命令：`npm run ai:smoke:v28`  
产物：`.nexa-data/ai-tests/v2.8-credits-economy-smoke.json`

| 用例 | 结果 |
|---|---|
| Search 免费 | ✅ |
| Guest 无 confirm → confirm_required | ✅ |
| Guest Research → login_required | ✅ |
| Ledger jobId / capability / status | ✅ |

---

## 5. 入口

- 账户 → **AI Credits**（`/account/credits`）
- 搜索页「生成 AI 概览」确认面板
- 创作 / QA / 图片工作台确认面板
