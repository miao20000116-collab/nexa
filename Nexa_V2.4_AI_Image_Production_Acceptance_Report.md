# Nexa V2.4 — AI Image Production Acceptance Report

> 验收时间：2026-09-02  
> 范围：基于已有素材的真实图片生成、入库、Credits、History  
> **未进入** Video 产品化深化 / Publishing 扩展

---

## 1. 总体结论

**代码与产品闭环：通过**  
**真实生成 ≥3 张不同图片：阻塞（`.env` 未配置 `AI_BASE_URL` + `AI_API_KEY`）**

| 项 | 状态 |
|---|---|
| Existing Assets First（商品/人物/场景/Logo 优先排序） | ✅ `rankAssetForImageRef` |
| 生成类型：场景图 / 社媒封面 / 电商主图 / 内容配图 | ✅ |
| 选 Asset + 自然语言需求 | ✅ `/create/image` |
| 真实 Image Provider（无 Mock） | ✅ `DomesticImageProvider` → `/images/generations` + `/images/edits` |
| 结果写入 Assets Library | ✅ `createGeneratedImageAsset` |
| 预计 Credits / 成功扣除 / 失败不扣完整费用 | ✅ estimate + Orchestrator 仅 success 记账 |
| History（素材、Prompt、结果、Model、Usage、CreatedAt） | ✅ `.nexa-data/image-jobs/`（Model 仅服务端持久化，不回传 UI） |
| Lint / Typecheck / Build | ✅ PASS |
| 实际生成 3 张不同图 | ⏸ Provider 未配置 |

---

## 2. 产品入口

| 入口 | 路径 |
|---|---|
| 创作 Hub | `/create` →「AI 图片生产」 |
| 图片工作室 | `/create/image` |
| 素材库 | `/assets` →「AI 图片生产」 |
| API | `GET/POST /api/image` |

---

## 3. 生成管线

```
选参考 Asset（可选，优先已有）
→ 选择 purpose + 自然语言 Prompt
→ 组装 finalPrompt
→ AIGateway.generateImageWithMeta（真实 Provider）
→ 落盘 bytes → Assets Library
→ 写入 Image Job History（含 modelInternal / usage）
→ 成功才 chargeCredits(generateImage=8)
```

参考图：有 Asset 时优先走 `/images/edits`，失败再回退 `/images/generations`（可带 image base64）。

---

## 4. Credits

- 预计：`estimateCredits("generateImage")` → UI「预计消耗约 8 Credits…」
- 成功：Orchestrator `chargeCreditsForUsage`
- 失败 / `blocked_ai_unavailable`：**不扣除**完整生成费用（`creditsCharged = null`）
- 客户端不展示 Key / Model 名

---

## 5. History 字段（服务端）

`id, userId, purpose, prompt, finalPrompt, referenceAssetIds, resultAssetId, resultUrl, status, modelInternal, providerInternal, latencyMs, creditsEstimated, creditsCharged, usage, createdAt, updatedAt`

客户端视图已剥离 `modelInternal` / `providerInternal`。

---

## 6. Smoke

命令：`npm run ai:smoke:v24`  
产物：`.nexa-data/ai-tests/v2.4-image-smoke.json`

当前结果：

```json
{
  "available": false,
  "status": "blocked_ai_unavailable",
  "hasBase": false,
  "hasKey": false
}
```

诚实阻塞，**未伪造图片**。

---

## 7. 解除阻塞（生成 ≥3 张）

在 `.env` 配置（仅服务端）：

```
AI_BASE_URL=https://你的兼容OpenAI网关
AI_API_KEY=你的密钥
AI_MODEL_IMAGE=dall-e-3   # 或网关支持的图片模型
NEXA_IMAGE_ENABLED=1
```

可选：`AI_MEDIA_BASE_URL` / `AI_MEDIA_API_KEY` 覆盖媒体专用端点。

然后执行：

```bash
npm run ai:smoke:v24
```

预期：`completedCount === 3`，三张不同 purpose 的图入库并写入 history。

---

## 8. 明确未做

- 视频生成产品化
- 图片批量 UI 队列可视化深化
- Credits 充值
