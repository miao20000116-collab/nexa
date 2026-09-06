# Nexa 创作 & 跨境商业 · 功能评审包

给其他 Agent / 人工评审用。

## 交付物

| 文件 | 说明 |
|------|------|
| `Nexa_创作与跨境商业_功能评审包.pdf` | 主交付：功能说明表 + **18 张整页截图** |
| `Nexa-create-commerce-review.pdf` | 同上 PDF 的英文文件名副本（方便拷贝） |
| `review.html` | 同源 HTML（浏览器打开可预览） |
| `screenshots/*.png` | Playwright `fullPage: true` 整页截图原图 |
| `manifest.json` | 截图元数据（尺寸、路由） |

## 覆盖范围

- **创作**：`/create`、工作台、`/create/image`、素材、发布
- **跨境**：入口 + Amazon（概览/商品/广告/利润/库存）+ TikTok（概览/商品/内容/Creator）

截图前使用演示账号 `POST /api/auth/demo`（tier=pro）登录，否则跨境 API 会 401。

## 重新生成

```bash
# 需本地 npm run dev 在 :3000
node scripts/capture-review-pdf.mjs
```
