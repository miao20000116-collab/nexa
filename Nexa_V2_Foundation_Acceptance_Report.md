# Nexa V2.0 Foundation Acceptance Report

> 阶段目标：**Foundation Stabilization** — 修复 V1 基础问题，不接入新 AI Provider，不新增复杂功能。  
> 验收时间：2026-09-02  
> 环境：`http://localhost:3000`（`npm run dev`）  
> 构建：`npm run lint` / `npm run typecheck` / `npm run build` 全部 **PASS**

---

## 1. 总体结论

**V2.0 Foundation 通过**

本阶段已完成 V1 验收报告中与「基础稳定性」相关的 P1/P2 修复，并落地真实素材库与意图路由。  
**未进入 AI 开发**（Deep Research / Overview / 生成 / 发布仍依赖后续 AI Provider 配置）。

| 维度 | 结论 |
|---|---|
| Hydration Error | **已修复**（根因消除，未使用 `suppressHydrationWarning`） |
| Assets 素材库 | **通过**（真实上传/处理/状态机，绑定 userId） |
| Intent Router | **通过**（SEARCH / RESEARCH / CREATE / COMMERCE 确定性规则） |
| Search 真实搜索 | **通过**（保留 SearXNG / Wikipedia / YouTube，区分 EMPTY/ERROR/TIMEOUT） |
| Workspace 去重 | **通过**（提示「该内容已在工作区」） |
| UI 中文化 / 空态 | **通过**（首页 Search-first，素材库中文化） |
| Lint / Typecheck / Build | **全部 PASS** |

---

## 2. Hydration Error 修复

### 问题根因

1. **`SearchInput` 使用 `useSearchParams()`**  
   首页将其包在 `<Suspense>` 中，服务端渲染 fallback（空 `div`），客户端首屏渲染完整表单 → **SSR/Client HTML 不一致**。

2. **`/search` 页 `SearchResults` 同样依赖 `useSearchParams`**  
   Suspense fallback（Loading 旋转图标）与客户端首屏结构不一致。

3. **工作区相关 UI 在 hydration 前读取 localStorage 状态**  
   `WorkspaceBar`、搜索结果「已加入」状态可能在首屏与服务端不一致。

### 修复方案（未使用 suppressHydrationWarning）

| 文件 | 改动 |
|---|---|
| `src/components/search-input.tsx` | 移除 `useSearchParams`；通过 props 传入 `workspaceId` |
| `src/app/search/page.tsx` | 改为 Server Component，从 `searchParams` 读取 `q` / `workspaceId` 并传给 `SearchResults` |
| `src/app/page.tsx` | 移除不必要的 `Suspense` 包裹 |
| `src/hooks/use-hydrated.ts` | 新增 `useSyncExternalStore` 实现的 `useHydrated()` |
| `src/modules/search/components/search-results.tsx` | 工作区 UI 在 `hydrated && workspaceHydrated` 后才渲染 |
| `src/modules/workspace/components/workspace-bar.tsx` | 双重门禁：`useHydrated()` + context `hydrated` |
| `src/lib/format.ts` | 统一 UTC 日期格式化，避免时区漂移 |

### 验证

- 浏览器打开 `/`、`/search?q=什么是%20RAG？` — Dev overlay **无 Hydration Error**
- `npm run build` 成功，`/search` 路由标记为 `ƒ`（动态，符合预期）

---

## 3. Assets 素材库

### 能力清单

| 能力 | 状态 | 说明 |
|---|---|---|
| 图片 / 视频 / 音频 / PDF / DOCX / TXT | ✅ | `detectAssetType` + MIME/扩展名识别 |
| upload | ✅ | `POST /api/assets` multipart |
| processing | ✅ | 上传后自动进入 `processing` |
| ready | ✅ | 图片元数据、视频代理（FFmpeg 可用时）、音频/文档直链 |
| failed | ✅ | 处理失败标记 + `errorMessage` |
| retry | ✅ | `POST /api/assets/[id]` action=retry |
| delete | ✅ | `DELETE /api/assets?id=` |
| userId 绑定 | ✅ | 上传需登录；`listOwnedAssets` / `assertAssetAccess` 按用户隔离 |

### UI（`/assets`）

| 功能 | 状态 |
|---|---|
| 上传素材（非 Upload Asset） | ✅ |
| 拖拽上传 | ✅ |
| 类型 / 状态筛选 | ✅ |
| 列表预览缩略图 | ✅ |
| 详情页预览（图/视频/音频/文档） | ✅ `/assets/[id]` |
| 删除 / 重试 / 状态标签 | ✅ |
| 访客未登录空态 | ✅ 「登录后可上传并管理素材」 |

### 关键文件

- `src/modules/assets/asset-service.ts`
- `src/modules/assets/asset-processor.ts`
- `src/app/api/assets/route.ts`
- `src/modules/assets/components/assets-page-client.tsx`

---

## 4. Intent Router

### 实现

- 模块：`src/modules/intent/entry-router.ts`
- 意图：`SEARCH` | `RESEARCH` | `CREATE` | `COMMERCE`
- 方式：**确定性正则规则**，无 Agent、无 LLM
- 模糊输入默认：`SEARCH`（confidence 0.7）

### 路由行为

| 输入示例 | 意图 | 目标路径 |
|---|---|---|
| `什么是 RAG` | SEARCH | `/search?q=…` |
| `美国 AI 眼镜市场最近发生了什么` | RESEARCH | `/workspace?goal=…&action=research` |
| `帮我做短视频` | CREATE | `/create?goal=…&mode=idea` |
| `为什么 Portable Blender 卖不好` | COMMERCE | `/commerce/amazon/products/prod_portable_blender` |

### 接入点

- 首页 `SearchInput` 提交 → `buildEntryPath()`
- 首页「试试这些」建议链接 → `buildEntryPath()`（创作类直达 `/create`）

---

## 5. Search

### 保持真实搜索

- ✅ SearXNG Web / 图片
- ✅ Wikipedia（含 RAG 直接 lookup 优化）
- ✅ YouTube
- ✅ 无 Mock 结果代码

### 失败态区分

新增 `SearchFailureKind`：`empty` | `error` | `timeout` | `null`

| 场景 | failureKind | UI 文案 |
|---|---|---|
| 各源均无结果 | `empty` | 未找到相关结果 |
| 全部 Provider 失败 | `error` | 搜索服务暂时不可用 |
| 全部 Provider 超时 | `timeout` | 搜索请求超时 |
| 部分源失败但有结果 | `null` | 正常展示 + `status: partial` |

### 其他

- AI Overview 未接入时展示「AI 概览暂未接入」（诚实空态）
- 社媒 Tab 空结果 / 错误分别有中文提示

---

## 6. Workspace

| 项 | 状态 |
|---|---|
| URL 去重 | ✅ 保持 |
| 重复加入提示 | ✅ 「该内容已在工作区」 |
| 研究工作区命名乱码 | ✅ 引导创建工作区时不再将原始 `goal` 直接作为 `name`，改用 `generateWorkspaceName(query)` |

---

## 7. UI 修复

| 项 | 状态 |
|---|---|
| 首页 Search-first | ✅ 未改为 Dashboard |
| 搜索框圆角 | ✅ 对齐 `--nexa-radius-xl` |
| 素材库中文化 | ✅ 「上传素材」等 |
| 创作空态引导 | ✅ 「从想法开始」按钮（V1 已有，保持） |
| Amazon Sessions 标签 | ✅ 改为「访问量 (Sessions)」 |
| 英文 UI 清理 | ✅ 主要用户路径已中文化；专业词 Asset / Metadata / Prompt 保留 |

---

## 8. 构建与质量门禁

```
npm run lint      → PASS（0 errors，7 warnings，均为既有 img / unused 警告）
npm run typecheck → PASS
npm run build     → PASS
```

---

## 9. 本阶段明确未做（按约束）

| 项 | 说明 |
|---|---|
| 新 AI Provider 接入 | ❌ 未做 |
| Deep Research 真实报告 | ❌ 仍 `not_configured` |
| AI Overview 生成 | ❌ 仍 `unavailable` |
| 真实发布 OAuth | ❌ 仍诚实阻断 |
| 自动化测试套件 | ❌ 仍无 `npm test` |

**不得继续进入 AI 开发** — 下一阶段需单独立项与配置 `AI_BASE_URL` / `AI_API_KEY` 后再启动。

---

## 10. V1 → V2 问题对照

| V1 问题 | 优先级 | V2 状态 |
|---|---|---|
| 素材库占位 | P0 | ✅ 已实现真实素材库 |
| AI 未接入 | P0（环境） | ⏸ 本阶段刻意不做 |
| 真实发布未接通 | P0 | ⏸ 本阶段刻意不做 |
| Hydration Error | P1 | ✅ 已修复 |
| 首页不按意图分流 | P1 | ✅ Intent Router |
| Wikipedia 不稳定 | P1 | ⚠ 已优化 direct lookup；仍依赖外网 |
| X 搜索易空 | P1 | ✅ 诚实空态 + 建议 |
| 工作区去重无提示 | P1 | ✅ |
| AI Overview 无提示 | P1 | ✅ |
| 创作空态无引导 | P1 | ✅ 保持 |
| 工作区乱码名 | P2 | ✅ |
| 搜索框圆角不一致 | P2 | ✅ |
| Amazon Sessions 英文 | P2 | ✅ |

---

## 11. 验收证据摘要

| 检查项 | 结果 |
|---|---|
| 首页无 Hydration Error | 通过 |
| 搜索页无 Hydration Error | 通过 |
| `什么是 RAG？` 含 Wikipedia 知识卡 | 通过（浏览器实测） |
| AI 概览未接入诚实提示 | 通过 |
| 素材库上传/筛选/拖拽 UI | 通过 |
| Intent：创作 → `/create` | 通过（tsx 脚本验证） |
| Intent：跨境 → Amazon 诊断 | 通过 |
| Lint / Typecheck / Build | 全部 PASS |
| 未新增 AI Provider | 通过 |
| 一级导航未改动 | 通过 |

---

## 12. 建议的下一阶段（非本阶段范围）

1. 配置 AI Provider 后复测 Overview / Research / 创作生成  
2. 素材库与创作工作台联动（从素材创建项目）  
3. 双用户越权自动化测试  
4. 补充 `npm test` 冒烟用例（Intent Router、Workspace 去重、Search failureKind）

---

*本报告对应 Nexa V2.0 Foundation Stabilization 阶段交付物。AI 能力开发不在本阶段范围内。*
