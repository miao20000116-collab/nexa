# Nexa V2.7 — Commerce Intelligence Acceptance Report

> 验收时间：2026-09-02  
> 范围：在现有 Amazon / TikTok Demo Commerce 上增强经营智能分析  
> 原则：**不重做页面**；无真实账号时仅用 **Demo Store**，不伪造连接

---

## 1. 总体结论

**通过**

| 项 | 状态 |
|---|---|
| Amazon：Sales / Sessions / CVR / Orders / AOV / ACOS / Ad Spend 分析 | ✅ |
| 维度：流量 / 转化 / 客单价 / 广告 / 商品 | ✅ |
| 输出：问题 / 证据 / 建议（Diagnosis → Evidence → Action） | ✅ |
| TikTok：Views / Clicks / CVR / Orders / GMV | ✅ |
| 识别高播放低转化 / 低播放高转化 | ✅ |
| 诊断 → Search（竞品 / 市场 / 用户反馈 / 内容趋势） | ✅ |
| 诊断 → Creation（`mode=commerce` + `commerceContext`） | ✅ |
| Demo Store 明确标注，无假账号连接 | ✅ |
| 无 CoT / 思考过程下发 | ✅ |
| Lint / Typecheck / Build / Smoke | ✅ |

---

## 2. 架构（增量）

```
现有 Amazon / TikTok Demo 诊断页
  → service.getProductDiagnosis / getTikTokProductDiagnosis
  → intelligence/*-analyzer（本地规则，无 Key 可用）
  → maybeEnrichWithAI（可选；不可用时 blockedAi=true）
  → findings-panel（问题 / 证据 / 建议）
  → nextActions → /search | /create?mode=commerce&commerceContext=…
```

新增模块：`src/modules/commerce/intelligence/`

---

## 3. Demo Store

- Shell 角标：`Demo Store（非真实账号）`
- 诊断载荷：`demoStoreLabel: "Demo Store（非真实账号连接）"`、`isDemo: true`
- **不**模拟 OAuth / 直播间真实店铺授权

---

## 4. Smoke 证据

命令：`npm run ai:smoke:v27`  
产物：`.nexa-data/ai-tests/v2.7-commerce-intelligence-smoke.json`

| 通道 | 结果 |
|---|---|
| Amazon Portable Blender | 结论「转化率（CVR）下降」；3 条 findings；竞品/市场/反馈/趋势/创作深链齐全；`blockedAi=true`（无 Key） |
| TikTok Blender | 识别「高播放低转化」+「低播放高转化」；6 条 findings；同上 Search/Create intents |
| CoT 泄漏 | **无** |

---

## 5. 入口（沿用现有路由）

- Amazon 商品诊断：现有 `/commerce/amazon/...` 商品诊断页  
- TikTok 商品诊断：现有 `/commerce/tiktok/...` 商品诊断页  

页面布局未重设计；仅增加智能分析块与 Demo Store 文案。
