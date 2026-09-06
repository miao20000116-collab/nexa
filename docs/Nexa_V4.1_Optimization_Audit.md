# Nexa V4.1 — Phase 1 Audit

> Optimization，不是 Rebuild。本文件是实施前审计，不代表最终验收报告。

生成时间：2026-09-03

---

## 1. Creation 页面结构（现状）

| 路由 | 组件 | 职责 |
|------|------|------|
| `/create` | `create-hub.tsx` | 六种 startMode 卡片网格 → 表单（goal/类型/平台）→ 历史项目列表 |
| `/create/[id]` | `creation-workbench.tsx` | 标题栏多按钮 + Timeline pills + 全字段表单 + 每字段 FIELD_ACTIONS + Context 侧栏 + QA + Publish |
| `/create/image` | `ImageStudio` | 独立图片生产（保留，本轮不重做） |

**已有能力（必须保留）**

- Start modes: idea / search / workspace / assets / commerce / link
- Timeline、字段（title/hook/body/structure/cta/hashtags/cover）、generate、field rewrite、QA、Preview、Publish、promptOverride
- Context 组装：`context-assembler.ts`（workspace / commerce brief / sources）
- API：`GET/POST /api/create`，`GET/PATCH /api/create/[id]`

**体验问题**

- 首页第一视觉是「选工具卡片」，不是「你想完成什么」
- 工作台：Timeline / 字段 / 6 个 AI 按钮 / Credits / QA / Publish 同权重抢注意力
- 历史列表含大量 smoke / 测试项目噪音
- Credits 确认对低成本改写也打断流

---

## 2. Commerce 页面结构（现状）

| 路由 | 现状 |
|------|------|
| `/commerce` | 双入口占位（Amazon / TikTok） |
| `/commerce/amazon` | **8 个 MetricCard 占第一屏** → 发现问题列表 → 商品表 |
| `/commerce/amazon/products/[id]` | 结论 + IntelligenceFindings + 证据 + 指标卡 + nextActions（搜索/创作） |
| `/commerce/amazon/ads|profit|inventory` | 偏 Dashboard |
| `/commerce/tiktok` | 7 指标卡 → contentInsight → 商品 |
| `/commerce/tiktok/content|creators|products` | 内容/达人/诊断 |

**已有能力（必须保留）**

- Demo Store、range 7/30/90、诊断 API、`amazon-analyzer` / `tiktok-analyzer`
- nextActions → Search / Create（`commerceContext` query）
- `buildCreateHrefFromCommerce` in intelligence/types

**体验问题**

- Overview 以 KPI 网格为主角，Insight/Action 在下方或偏弱
- Alerts 只有标题+短文案，缺少 Evidence 三件套与 Primary Action
- DemoBadge 琥珀色偏「状态贴纸」；登录失败态文案过简（「加载失败」）
- TikTok 已有 contentInsight，但视觉仍被指标卡压住

---

## 3. V3/V4 能力清单（本轮不删）

| 域 | 能力 |
|----|------|
| AI | AIOrchestrator、CapabilityRouter、ProviderRegistry、Credits gate、usage log |
| Search | Orchestrator、AI Overview（免费）、双轨检索、/read |
| Workspace / Memory | Workspace sources、Memory 偏好（creation 侧可引用） |
| Research | Research jobs / 结论（与 Creation 衔接需加强可见性） |
| Creation | 全链路 + Image/Video workbench |
| Commerce | Amazon + TikTok Demo 诊断与跨模块链接 |
| QA / Publish / Credits / Account | 现有面板与权限 |

---

## 4. 可复用组件 / Design System

- Tokens：`globals.css` → `--nexa-bg/fg/border/radius/shadow`
- Shell：`CommerceShell` / `TikTokShell` / `MetricCard` / `DeltaText` / `DemoBadge`
- `CreditsConfirmPanel`、`IntelligenceFindingsPanel`、`PublishPanel`、`ContentQAPanel`
- `ModulePlaceholder`（commerce hub）
- **缺口**：缺少统一的 `NexaInsight`、`PrimaryAction`、`ContextIndicator`、`EmptyState` 模式组件（本轮轻量新增 UI 辅助，不新建子系统）

---

## 5. AI 能力与按钮化问题

| 位置 | 现状 | 目标 |
|------|------|------|
| Workbench 顶栏 | 「AI 生成草稿」与预览/保存/完成并列 | Primary = 开始生成；其余降级 |
| 每字段 | FIELD_ACTIONS 常驻 6 按钮 | 收敛为「AI 编辑」菜单 |
| Commerce | 诊断文案在，但 Overview 不像「AI 在决策」 | Insight → Evidence → Action 置顶 |

---

## 6. Context 数据流

```
Search/Workspace/Assets/Link/Commerce Diagnosis
        ↓ (startMode + ids / commerceContext / brief)
   POST /api/create
        ↓
 creation-service + context-assembler
        ↓
 Workbench sources[] + brief
        ↓
 generate / rewrite (AIOrchestrator)
```

**缺口**

- Research → Creation 自动继承结论：入口/文案弱，用户感知不足
- Commerce → Creation：URL 传 `commerceContext` 已有，但 Hub/Workbench「已理解」层未展示
- Context 侧栏存在但偏技术列表，不是轻量 indicator

---

## 7. 问题分级

### P0（本轮必须改 · UX 层级，不改架构）

1. Creation Hub：**目标输入第一视觉**；start modes 降权
2. Creation Workbench：**任务 + AI 建议** 置顶；字段 AI 操作收敛；顶栏按钮降权
3. Amazon Overview：**今天最值得处理的 N 件事** 置顶；KPI 降为 Evidence
4. TikTok Overview：contentInsight / 待办置顶；KPI 次要
5. Creation History：过滤/弱化 smoke、test、无标题噪音
6. Commerce/Creation 空态与加载文案：说明原因 + 可做动作（不假成功）

### P1

7. Product Diagnosis：强化 Situation→Evidence→Opportunity→Action 文案层级（复用已有 findings）
8. Context indicator：可展开的「本次参考」轻量条
9. Credits：低成本 rewrite 减少打断（尊重现有 gate；仅 UI 收敛提示）
10. Commerce → Search/Create 主操作权重（每卡 1 Primary）
11. 响应式：Workbench 窄屏折叠侧栏/次要区

### P2

12. Memory 偏好仅在影响生成时露出
13. Research → Creation 显性继承条
14. 全站 Badge/Divider 收敛巡检
15. Demo 与真实账号空态引导（连接账户文案）

---

## 8. 明确不改

- 不替换 AIOrchestrator / CapabilityRouter / ProviderRegistry
- 不改 Commerce/Creation 数据模型与核心 API 契约
- 不删 Amazon/TikTok 子路由与 Demo Store
- 不新建 Agent/Model/Prompt/Workflow Center
- 不伪造 AI / Search / Publish / Commerce 数据
