# Nexa V4.1 Optimization Report（进行中）

> 本轮为 Optimization，非 Rebuild。完整验收需在 P1/P2 收敛后补齐 lint/build 与端到端检查。

---

## 1. 修改范围

### Creation
- `/create` Hub：目标第一视觉；「Nexa 已理解」；平台/类型推断 + 折叠高级选项；start modes 降为文字链；历史过滤 smoke/test
- Workbench：任务 + AI 建议置顶；主按钮「开始生成」；保存/完成收入「更多」；字段 AI 收敛为「AI 编辑」菜单；字段去卡片边框；Context「查看依据」
- Workbench 窄屏：侧栏（素材/来源/QA/发布）默认折叠，可展开

### Commerce
- Amazon Overview：Insight-first「今天最值得处理的 N 件事」+ Evidence/Action；KPI 默认折叠
- TikTok Overview：contentInsight 置顶；商品关注列表；KPI 折叠；错误文案改进
- Amazon / TikTok **商品诊断**：Situation → Evidence → Diagnosis → Opportunity → Action；指标卡折叠；主操作权重
- Amazon **广告诊断**：建议置顶；指标折叠；Tab 改为文字层级；可跳转 Search Terms / 搜索 / 创作
- `IntelligenceFindingsPanel`：去彩色 Badge / 卡片边框，改为编号排版

### Global / Docs
- `docs/Nexa_V4.1_Optimization_Audit.md` Phase 1 审计

### Context
- 未改 API；Commerce → Create 链接保留 `mode=commerce&commerceContext`
- Hub/Workbench 增强「已理解 / 依据」可见性

---

## 2. 未修改内容

- AIOrchestrator / CapabilityRouter / ProviderRegistry
- Creation / Commerce 数据模型与核心 API
- Amazon/TikTok 子路由、Demo Store 数据生成
- Search / Workspace / Research / Memory / QA / Publish / Credits 记账逻辑
- 未新建 Agent / Model / Prompt / Workflow Center

---

## 3. 优化前后对比

| 模块 | 优化前 | 优化后 |
|------|--------|--------|
| Creation Hub | 六宫格选工具 | 目标驱动 + 可选上下文 |
| Creation Workbench | 多按钮 + 字段 AI 按钮墙 | Primary 生成 + AI 编辑菜单 |
| Amazon Overview | 8 KPI 第一屏 | 决策清单第一屏，KPI 为证据 |
| TikTok Overview | 指标压过洞察 | Insight → 行动 → 指标 |
| History | 测试项目噪音 | 主列表过滤，可展开噪音 |
| AI | 按钮化 | 任务语境 + 收敛操作 |

---

## 4. 风险

| 级 | 项 |
|----|-----|
| P0 | 无架构破坏（`tsc --noEmit` 已过） |
| P1 | 历史过滤可能误伤标题含 test 的真实项目 — 可再收紧规则 |
| P1 | Profit / Inventory / TikTok content·creators 页仍偏表格式，可再 Insight-first |
| P2 | Research → Creation 显性继承条、Memory 外显、统一 EmptyState 组件仍待做 |

---

## 5. 验收（当前）

- `tsc --noEmit`：通过
- 建议本地再验：
  - `/create`、`/create/[id]`（窄屏展开侧栏）
  - `/commerce/amazon`、`/commerce/amazon/products/[id]`、`/commerce/amazon/ads`
  - `/commerce/tiktok`、`/commerce/tiktok/products/[id]`（需登录 demo）
- 后续：`npm run lint` / `npm run build` + 全链路手工走查

---

## 6. 下一步（按原规范）

1. Profit / Inventory / TikTok Content 页 Insight-first（P1 余量）
2. Research → Creation 继承条（P2）
3. 全站 Badge/Divider / DemoBadge 收敛巡检（P2）
4. 统一 loading / empty / error 文案模式
