# Nexa UI / UX Optimization Report

> Optimization，不是 Rebuild。  
> 时间：2026-09-04  
> 原则：保留路由 / API / 数据结构 / AIOrchestrator / Commerce Demo 诚实态；只改呈现层。

---

## 1. Global Changes

| 项 | 变更 |
|---|---|
| `src/lib/ui-hierarchy.ts` | 建立 L1–L5 层级：`focusTitle` / `focusMetric` / `evidence` / `insight*` / `action.primary|secondary|tertiary`；页面宽度 token（create / account / wide） |
| `src/components/ui/hierarchy.tsx` | 新增 `NexaInsight`、`ActionCluster`、`FocusBand`；强化 `PageHeader` 字号与间距 |
| 设计语言 | 保持白底中性；去掉 Search Overview 渐变「AI+」贴纸式表达，改为「Nexa 概览」 |

未改：AIOrchestrator、CapabilityRouter、ProviderRegistry、WorkspaceContext、Memory、Research、Creation/Commerce API、Credits 记账、Publish OAuth。

---

## 2. Page Changes

### P0

| 页面 | 变更 |
|---|---|
| **Creation Hub** | 默认模式改回 **目标优先（idea）**；首屏「你想完成什么？」+ 主 CTA；链接二创降为可选上下文文字链，去掉三卡等权入口 |
| **Creation Workbench** | 任务用 `focusTitle`；参考解析默认折叠；顶栏按钮统一 `action.*` 层级 |
| **Amazon Overview** | **优先事项置顶**；走势/贡献次之；KPI + 商品表默认折叠；每项含 Evidence + Nexa 判断 + ActionCluster |
| **Product Diagnosis** | 商品名升为焦点；「当前最重要的问题」+「Nexa 判断」分层；动作主次重排 |
| **TikTok Overview** | **内容情报置顶**；GMV 走势降为证据；首个商品高亮；统一 ActionCluster |

### P1

| 页面 | 变更 |
|---|---|
| **Home** | 标题改为 Goal→Result；placeholder「问题、目标或任务」；建议带链路 hint |
| **Search Overview** | 去渐变；摘要字号加大；「要点」改为「核心结论」弱标签 |
| **Workspace 列表** | 去掉大型链路地图卡，改为一行文字路径 + Context Hub 文案 |
| **Publish** | 当前作品 / QA 主 CTA 优先；发布记录升为第二焦点；平台能力收入折叠 |
| **Commerce Hub** | 去掉断链 `/commerce/workspace`、`/commerce/metrics`；改为工作区文字链 + 说明指标在平台页底部 |

### P2

| 页面 | 变更 |
|---|---|
| **Image Studio** | PageHeader「为任务制作图片」；用途轻量按钮；结果条强化 |
| **Assets 列表** | 上传为主 CTA；创作次之；格式说明下沉 |
| **Asset Detail** | 文件名 +「用于创作」优先；预览次之；基础信息折叠 |
| **Credits** | 余额 `focusMetric` + 行动链 |
| **Memory** | 先展示「记住了什么」，新增表单下沉 |
| **Account Home** | 身份条 + 设置列表（去卡墙） |
| **Amazon Ads** | 优先事项置顶；广告智能面板默认折叠 |
| **Amazon Profit** | 预计利润数字置顶；财务面板折叠 |
| **Amazon Inventory** | 高风险商品 FocusBand + CTA；智能面板折叠 |
| **TikTok Content** | 内容情报置顶；投放面板/更多建议折叠 |
| **TikTok Creators** | 合作重点置顶，明细次之 |
| **Research Report** | 结论 + 行动置顶；趋势/分歧/来源折叠 |

Connections / Privacy 等低频说明页未深改，可按同一模式轻触。

---

## 3. Preserved Functionality

- **路由**：全部既有 `page.tsx` 保留；仅 Hub 文案与链接触达修正  
- **API**：`/api/create`、`/api/commerce/*`、`/api/search`、`/api/workspace`、`/api/publish/*`、`/api/memory`、`/api/credits` 未改契约  
- **AI**：生成 / rewrite / Overview / Research / QA 调用链未改  
- **Commerce**：Demo Store、`isDemo`、range、诊断 analyzer、workflow href 保留  
- **Context / Memory / Research**：assembler 与注入逻辑未改  

---

## 4. Interaction Changes

| 以前 | 现在 | 原因 |
|---|---|---|
| 创作默认「链接二创」表单墙 | 先写目标 → 开始创作 | Goal → Result |
| Amazon 首屏是走势图 | 首屏是「今天最值得处理的 N 件事」 | 判断优先于图表 |
| TikTok 首屏是 GMV 图 | 首屏是内容情报 + Nexa 判断 | Content Intelligence |
| 工作区首屏大地图卡 | 一行路径说明 | 减少噪音 |
| 发布首屏平台能力卡墙 | 当前作品 / 记录优先，能力折叠 | 执行流程感 |
| Commerce Hub 断链 | 有效入口 + 诚实说明 | 不制造 404 |
| 广告首屏是智能面板 | 优先建议置顶，面板折叠 | 行动优先 |
| 利润首屏是构成表 | 预计利润数字 + 说明置顶 | 焦点指标 |
| 库存首屏是智能面板+表 | 高风险商品 FocusBand | 风险优先 |
| 账户首屏卡墙 | 身份 + 设置列表 | 减少噪音 |
| Research 全量章节平铺 | 结论/行动置顶，其余折叠 | 可读性 |

---

## 5. Visual Hierarchy Improvements

结论优先的页面：

- Amazon Overview / Product Diagnosis  
- TikTok Overview（内容情报）  
- Creation Hub（目标）  
- Search Overview（答案摘要）  
- Publish（当前作品 → 记录）  
- Amazon Ads / Profit / Inventory  
- TikTok Content / Creators  
- Account / Credits / Memory  
- Research Report（结论 → 行动）  
- Asset Detail（用于创作）

明细（KPI 网格、平台能力、参考解析、指标词典、智能面板、基础元数据）改为 **Level 5：折叠 / 次级**。

---

## 6. Regression Check

| 模块 | 状态 |
|---|---|
| Search | 逻辑未改；Overview 样式调整 |
| Workspace | 列表呈现调整；详情 API/动作未改 |
| Research | 报告呈现调整；生成 API 未改 |
| Creation | 默认模式与呈现调整；`handleCreate` / 生成 API 保留 |
| Commerce | 仅 JSX 顺序与层级；fetch 路径不变 |
| QA / Credits / Publish | Publish 布局调整；连接与记录 API 保留 |
| Account | 首页列表化；Credits / Memory 层级调整；登录 API 未改 |
| Assets | 详情行动优先；上传/删除 API 未改 |

断链修复：Commerce Hub 不再指向不存在的 `/commerce/workspace`、`/commerce/metrics`。

---

## 7. Build / Typecheck / Lint

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | **通过**（P2 完成后复验） |
| `npm run lint` | **9 errors / ~37 warnings**——均为既有问题（`prefer-const`、React Compiler setState-in-effect 等），**非本轮 UI 改动引入** |

建议本地再验：

1. `/` 首页文案与建议 hint  
2. `/create` 目标优先 → 进工作台  
3. `/commerce/amazon` 优先事项在走势之上  
4. `/commerce/tiktok` 内容情报置顶  
5. `/publish` 记录优先、能力折叠  
6. `/commerce` 无 404 链接  
7. `/commerce/amazon/ads` 建议在面板之上  
8. `/commerce/amazon/profit` 利润数字置顶  
9. `/commerce/amazon/inventory` 高风险 FocusBand  
10. `/account` 设置列表；`/assets/[id]`「用于创作」  

---

## Final Verdict

**呈现层优化已落地（P0 + P1 + P2）**：信息层级统一为「目标 / 判断 / 一步行动」，明细与智能面板默认折叠。  
**底层能力未重构。**  
Connections / Privacy 等低频页可按同一模式轻触，无架构阻塞。
