# Nexa V1 Final Acceptance Report

> 验收原则：只检查 → 记录问题 → 分类 P0/P1/P2 → **本轮未修改代码**。  
> 验收时间：2026-09-02  
> 环境：`http://localhost:3000`（`npm run dev`）  
> 证据来源：浏览器实际操作 + API 实测 + 页面截图/快照 + Build

---

## 1. 总体结论

**有条件通过**

说明：

- **Search / Workspace / Creation 入口 / Commerce Demo / Guest 边界 / 安全诚实性** 基本成立，可作为 AI PM 作品集展示「产品骨架 + 真实搜索 + 商业诊断闭环」。
- **素材库未实现、当前环境 AI 未接入、真实发布未接通、部分搜索来源不稳定**，导致 Demo A/B/D 无法完整走通到「生成结果 / 成片 / 真实发布」。
- **不建议**在未修复 P0、未配置 AI、未补齐素材库前，宣称「V1 已可对真实用户开放全链路」。

---

## 2. P0 问题

| 问题 | 页面 | 复现步骤 | 严重程度 | 建议 |
|---|---|---|---|---|
| 素材库为占位页，上传/处理/智能找素材全部 disabled | `/assets` | 打开「我的素材」→ 仅见占位文案「素材库能力将在素材阶段完善」 | P0 | Demo B 阻断。需实现真实上传与状态机，否则不能宣称 Assets 完成 |
| 当前环境 AI Capability 全部 `not_configured`，Deep Research / Overview / 草稿生成无法产生真实结果 | `/api/capability`、研究/创作 | GET `/api/capability` → 全能力 not_configured；Guest 调研究返回 401；未登录高成本 AI 被拦 | P0（环境+产品闭环） | 配置 `AI_BASE_URL`+`AI_API_KEY` 后复测 Demo A；未配置时 UI 诚实，但「研究→报告→创作」闭环不可展示为已完成 |
| 真实发布链路未接通（OAuth token exchange / Publish API pending） | 发布 | 发布 Provider 固定返回 unsupported；不会伪造成功（正确），但无法完成真实 Publish | P0（相对「发布闭环」） | 作品集可诚实写「未获平台权限则阻断」；不能写「已支持真实发布」 |

---

## 3. P1 问题

| 问题 | 页面 | 复现步骤 | 严重程度 | 建议 |
|---|---|---|---|---|
| 首页 / 搜索页存在 React Hydration Error（Dev overlay） | `/`、`/search` | 打开首页或搜索结果，Next Dev Tools 报 hydration error（`HomePage` / `WorkspaceBar`） | P1 | 排查 server/client 不一致（可能与 workspace 状态、日期或随机 ID 有关） |
| 首页输入不按意图分流：研究/创作/跨境目标一律进 Search | `/` | 输入「帮我做短视频」「为什么 Portable Blender 卖不好」仍只路由 `/search?q=…` | P1 | 至少对明确 Creation/Commerce 意图做轻量路由或引导 |
| 「什么是 RAG？」Wikipedia 知识卡不稳定（有时 0 条 wiki） | Search API | 同 query 多次调用：偶发 `wiki=0`，UI 仅「综合/网页」 | P1 | 稳定 Wikipedia 召回与知识卡展示 |
| X / Social 搜索易空结果 | Search | `X 上最近大家怎么看 AI Agent？` → `status=empty` | P1 | 无结果时给中文空态与替代建议；避免 silently empty |
| 跨搜索累计资料时 URL 去重导致数量少于预期 | Workspace | 3 次搜索各加 3 条 → 最终 6 条（去重） | P1 | 产品上可接受；需在 UI 提示「已存在，未重复添加」 |
| AI Overview 在未接入时无卡片（正确），但搜索结果页缺少明确「AI 概览暂未接入」提示 | Search | RAG 搜索无 overview | P1 | 增加轻量空态，避免用户以为「AI 坏了」 |
| 用户隔离（User A/B）未做完整双账号实测 | API | 有 `assertWorkspaceAccess` 代码路径，但本轮未创建两名用户交叉访问 | P1 | 补一轮双用户手工/自动化用例 |
| 创作空态「暂无内容」缺少下一步引导 | `/create` | 无项目时仅「暂无内容」 | P1 | 引导点击「从想法开始」 |

---

## 4. P2 问题

| 问题 | 页面 | 建议 |
|---|---|---|
| Amazon 指标标签仍有英文 Sessions / Orders / AOV（可接受专业词，但「订单」已中文化不一致） | Amazon | 统一中文主标签，括号保留英文缩写 |
| 工作区列表出现 `??? RAG研究` 乱码名 | `/workspace` | 检查非 UTF-8 创建命名 |
| 首页搜索框圆角 `rounded-2xl` 略大于全局 `--nexa-radius` | `/` | 与全局 radius token 对齐 |
| Dev overlay / hydration 影响观感 | 全局 | 修 hydration 后生产环境无此问题 |
| 「Sessions」等专业词可保留，但表格「播放量」等已中文化，需全站统一策略 | Commerce | 出一份术语表 |

---

## 5. Search

真实搜索：**通过**  
证据：`POST /api/search` 返回真实 Web/YouTube URL；无 fake results 代码。

相关性：**有条件通过**  
证据：「什么是 RAG？」结果均为 RAG 相关；**未出现** “President of China”。Wikipedia 偶发缺失。

来源：**有条件通过**  
Web / YouTube 可用；Wikipedia 不稳定；Social/X 易空。UI 未暴露 SearXNG/Provider 工程名（通过）。

X：**失败（空结果，未伪造）**  
诚实空结果优于假帖；但仍未达到「有可用 X 内容」预期。

图片：**有条件通过**  
`AI眼镜图片` 返回 24 条 web 图搜类结果（依赖 SearXNG），非假图库。

视频：**通过**  
`AI眼镜评测视频` → `youtube:12`，标题含 AI glasses / 评测相关。

---

## 6. Workspace

**通过（临时工作区）**

证据：

- 搜索结果点击「+ 加入工作区」→ 变为「✓ 已加入」
- `/workspace` 可见「AI glasses研究 · 6 条资料」
- 跨搜索可累计（去重后 6/9）

未验证：长期持久化需登录 + DB（Guest 策略符合设计）。

---

## 7. Deep Research

**失败（当前环境）**

证据：`/api/capability` 全部 `not_configured`；Guest `POST /api/research` → 401「高成本生成需要登录」。  
未配置 AI 时无研究报告产出。产品未伪造完成状态。

---

## 8. Assets

**失败**

证据：`/assets` 为 `ModulePlaceholder`，上传与智能找素材均 disabled。  
Demo B 无法开始。

---

## 9. Creation

**有条件通过（入口通过，AI 生成失败）**

证据：

- `/create` 四个入口存在：从想法 / 搜索结果·工作区 / 我的素材 / 链接
- 中文 UI，非「Prompt + Generate」单按钮页
- AI 生成依赖登录 + AI 配置；本环境未实测成功草稿

---

## 10. Image Generation

**失败（未接入）**  
Capability `image: not_configured`，无伪造成功。

---

## 11. Video

**未完整实测 / 有条件失败**  
工作台代码存在（素材优先、补镜头、Timeline），但缺素材库与 AI/FFmpeg 实测成片。无法证明「可播放成片」。

---

## 12. Music

**未完整实测**  
代码支持用户上传音乐（最低路径）；AI 音乐未接入。本轮未实际上传音频文件。

---

## 13. QA

**未在 AI 接入下实测**  
发布预览含 QA verdict 字段与「通过/需要修改」UI；Guest 预览被 401 拦截。未跑通真实质检输出。

---

## 14. Publishing

**有条件通过（诚实阻断）**

证据：

- Guest `POST /api/publish/preview` → 401「发布需要登录后使用」
- Provider **不返回** fake `published`
- 未配置时文案方向为「当前平台暂不支持此发布方式」
- **无法**完成真实发布闭环

---

## 15. Amazon

**通过**

证据：

- 页面明确「Demo Store 演示数据」
- 销售额 US$7,426.01、Sessions、CVR、ACOS、预计利润均由当期 vs 上期计算（非写死 -18.2%）
- Portable Blender 诊断：**结论 → 证据 → 下一步**；CVR 3.7%→3.5%；Sales 分解校验流量×转化×客单价
- 下一步可进 Search / Creation / Workspace

---

## 16. TikTok Shop

**通过（Demo）**

证据：

- `isDemo=true`
- 内容经营存在视频列表；CVR 排序可区分「播放不一定最高但转化更高」（例：views 2665 / cvr 9.46% vs 更高播放更低 CVR）
- 与 Amazon 指标模型不同（视频/GMV/内容转化 vs 广告/Sessions/Listing）

---

## 17. Account

**通过（基础）**  
访客标识正确；登录/连接中心/隐私页可访问；连接中心明确「不会要求填写 API Key」。

---

## 18. Credits

**有条件通过（结构存在）**  
Credits 页与账本服务存在；本环境未跑通真实 AI 扣费（AI 未接入）。未见前端 Token 消耗展示。

---

## 19. Security

**有条件通过**

- 用户设置页**无** API Key / Base URL / Model 配置表单（通过）
- Guest 高成本 AI / 发布被拦（通过）
- Workspace 属主校验代码存在；**双用户越权未完整实测**（缺口）

---

## 20. API Security

**通过（静态检查）**

- 无 `NEXT_PUBLIC_*KEY/SECRET`
- 密钥仅服务端 `process.env`（如 `AI_API_KEY`、`YOUTUBE_API_KEY`）
- 隐私文案提及「不要求用户填写 API Key」属说明性文字，非输入框

---

## 21. Performance

**有条件通过**  
Search 使用 `Promise.allSettled` 并行 Provider + 单源超时；本轮未压测慢 Provider 场景。

---

## 22. Responsive UI

**有条件通过**  
首页 Desktop 视觉克制、搜索框为核心（截图确认）；移动端有底部导航。未系统测 390/768 全页溢出。

---

## 23. Build

Lint：**PASS**（0 errors，6 warnings）  
Typecheck：**PASS**  
Build：**PASS**  
Tests：**FAIL / N/A**（无 `npm test` / 无测试套件）

---

## 24. 核心闭环

Search → Workspace → Research → Creation → QA → Publish  

**FAIL**（当前环境）

已通：Search → 加入 Workspace → 创作入口  
未通：Deep Research 报告、AI 草稿、QA、真实 Publish

---

## 25. 商业闭环

Commerce → Diagnose → Search → Workspace → Creation → Publish  

**有条件 FAIL**

已通：Amazon 诊断 → 搜索/创作链接存在且可点  
未通：完整研究资料带入创作、AI 生成、发布

---

## 26. 最终建议

| 问题 | 结论 |
|---|---|
| 是否已达到 V1 Demo 标准？ | **部分达到**：Search + Workspace + Commerce Demo + 诚实安全边界可演示；Assets / AI / Publish 未达「全 Demo 闭环」 |
| 是否可以开始真实用户测试？ | **不建议全量**。可做「搜索 + 工作区 + 跨境 Demo」小范围演示；勿开放「素材/生成/发布」预期 |
| 是否可以开始作品集展示？ | **可以（需诚实标注）**：强调真实搜索、诊断证据链、不伪造发布/AI；明确素材库与 AI/发布依赖 |
| 是否还有 P0 阻断问题？ | **有**：① 素材库未实现 ② 当前无 AI Provider → 研究/生成闭环断 ③ 真实发布未接通 |

---

## 27. 验收证据摘要

| 检查项 | 结果 |
|---|---|
| 一级导航：搜索/工作区/创作/跨境商业 + 访客 | 通过，无 Agent/模型中心等违规一级菜单 |
| 首页视觉：克制、搜索框核心、无三卡片/大渐变 | 通过（截图） |
| RAG 搜索相关性 | 通过；无 President of China |
| 加入工作区 | 通过 |
| Amazon Demo 标注 + 计算 | 通过 |
| TikTok Demo + CVR 分化 | 通过 |
| Guest 禁止发布 | 通过（401） |
| 不伪造发布成功 | 通过 |
| 用户不可配置 API Key | 通过 |
| 素材上传 | 失败（占位） |
| AI Overview / Deep Research | 失败（未接入） |
| Hydration Error | 存在（P1） |
| Lint / Typecheck / Build | 全部 PASS |

---

## 28. 给人工第二轮验收的重点（Cursor 易漏）

1. **首页视觉气质**：是否真像 AI 搜索产品，而非工具站（本轮截图偏克制，通过）  
2. **搜索质量稳定性**：Wikipedia/X 波动需人工多刷几轮  
3. **AI 是否真有价值**：需在配置真实 AI 后复测 Overview / Research / 创作改写  
4. **模块是否像一个产品**：Commerce→Search→Create 链接在，但上下文自动带入深度需人工点穿  
5. **作品集叙事**：突出「真实搜索 + 证据型诊断 + 不造假」；弱化「全自动成片/全平台发布」

---

*清单文件：`Nexa_V1_最终全量验收清单.md`*  
*本报告为第一轮验收输出；按约定未在验收过程中修改产品代码。*
