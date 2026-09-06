# Nexa V2.9 — Publishing Integration Acceptance Report

> 验收时间：2026-09-02  
> 范围：Creation → QA → Preview → User Confirm → Publish → PublishRecord

---

## 1. 总体结论

**通过**

| 项 | 状态 |
|---|---|
| 仅对已获 API 权限的平台开放发布（env 配置） | ✅ |
| OAuth 连接平台账号 | ✅ |
| Token 服务端加密存储，不返回前端 | ✅ |
| 完整发布流程（含 QA 门闩） | ✅ |
| 不支持平台：明确「当前平台暂不支持直接发布」 | ✅ |
| 不伪造发布成功 | ✅ |
| PublishRecord：platform / account / contentId / status / publishedAt / externalUrl | ✅ |
| 失败可重新发布（retry + 再次确认） | ✅ |
| 真实发布必须用户 `confirmed: true` | ✅ |
| Smoke / Typecheck / Build | ✅ |

---

## 2. 发布流程

```
Creation（创作工作台）
  → QA（内容质检，NEEDS_REVISION 阻断）
  → Preview（/api/publish/preview：适配 + QA 快照）
  → User Confirm（前端确认面板 + confirmed: true）
  → Publish（/api/publish/confirm）
  → PublishRecord（/api/publish/records）
```

失败重试：`POST /api/publish/retry`（`recordId` + `confirmed: true`）

---

## 3. OAuth & Token

- 连接：`POST /api/publish/connections` → 官方 OAuth authorize URL
- 回调：`/api/publish/oauth/callback` → code 交换（X / YouTube 在配置 client secret 时）
- Token：AES-256-GCM 加密，存于 `.nexa-data/connection-tokens/{connectionId}.enc`
- **绝不**在 Connection API 响应中返回 access_token / refresh_token

---

## 4. 平台策略

| 平台 | publishApiAvailable | 说明 |
|---|---|---|
| X / YouTube / TikTok / Instagram / LinkedIn | 需 `NEXA_*_CLIENT_ID`（及 secret） | 有凭证才可 OAuth + 发布 |
| 小红书 / 抖音 | `false` | 明确不支持直接发布 |

---

## 5. Smoke 证据

命令：`npm run ai:smoke:v29`  
产物：`.nexa-data/ai-tests/v2.9-publishing-smoke.json`

| 用例 | 结果 |
|---|---|
| Token 加密往返 | ✅ |
| Token 独立文件存储 / 清除 | ✅ |
| 小红书 preview `canPublish=false` | ✅ |
| 未 confirm → 拒绝 | ✅ |
| 无连接 confirm → failed record（非 fake published） | ✅ |
| retry 路径可调用 | ✅ |

---

## 6. 入口

- 创作工作台侧栏：**发布**（PublishPanel）
- `/publish`：发布记录总览
- `/account/connections`：OAuth 连接中心
