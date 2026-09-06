# Nexa V2.6 — AI Content QA Acceptance Report

> 验收时间：2026-09-02  
> 范围：发布前内容质检（事实 / 来源 / 素材 / 版权 / 平台 / 安全 / 商业）  
> 流程：**Creation → QA → Preview → Publish**

---

## 1. 总体结论

**通过**

| 项 | 状态 |
|---|---|
| 七维检查 | ✅ |
| 输出 PASS / NEEDS_REVISION | ✅ |
| 问题含「哪里 / 为什么 / 怎么改」 | ✅ |
| 不展示 AI 思考过程 | ✅ 仅检测结果 / 问题 / 建议 |
| Creation 工作台接入 QA 面板 | ✅ |
| Preview / Publish 门闩（未通过不可发） | ✅ |
| Lint 0 error / Typecheck / Build | ✅ |
| Smoke | ✅ |

---

## 2. 检查维度

事实 · 来源 · 素材 · 版权风险 · 平台规范 · 安全 · 商业信息

本地规则始终执行；AI `qualityCheck` 可用时增强，不可用时诚实标注 `blockedAi`，不跳过本地门闩。

---

## 3. 输出形态

- `PASS` / `NEEDS_REVISION`（中文副标：通过 / 需要修改）
- `checks[]`：分项结果
- `issues[]`：`where` / `why` / `how` / `severity`
- `suggestions[]`
- **禁止**下发 reasoning / CoT 字段

---

## 4. Integration

```
Creation（工作台）
  → QA（/api/qa + ContentQAPanel）
  → Preview（/api/publish/preview 内嵌 QA）
  → Publish（confirm；NEEDS_REVISION → canPublish=false）
```

---

## 5. Smoke 证据

命令：`npm run ai:smoke:v26`  
产物：`.nexa-data/ai-tests/v2.6-qa-smoke.json`

| 用例 | 结果 |
|---|---|
| 夸大承诺 + 无来源 + 版权话术 | **NEEDS_REVISION**（5 项问题，含 where/why/how） |
| 合规体验文案 + 有来源 | **PASS** |
| CoT 泄漏 | **无** |

---

## 6. 入口

创作项目侧栏：**内容质检 QA** → 下方 **发布**（质量检查与预览）。
