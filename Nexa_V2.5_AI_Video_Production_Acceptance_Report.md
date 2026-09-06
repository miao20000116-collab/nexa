# Nexa V2.5 — AI Video Production Acceptance Report

> 验收时间：2026-09-02  
> 范围：素材优先覆盖、Storyboard、Timeline、真实 FFmpeg MP4、Music 优先级、Credits / 确认门闩  
> **未进入** Publishing 扩展

---

## 1. 总体结论

**通过：已产出真实 30 秒中文短视频 MP4（非伪造文件）。**

| 项 | 状态 |
|---|---|
| Existing Assets → existingCoverage / AI Required Coverage | ✅ |
| 禁止无限生成（仅补缺口） | ✅ `aiRequiredCoverageSec` |
| Storyboard：镜头 / 时长 / 画面 / 字幕 / 旁白 / 音乐策略 | ✅ |
| Timeline：Video / Image / Text / Music / Voice | ✅ |
| 真实 Video Provider 调用（有 Key 时） | ✅ 接入；无 Key 时诚实阻塞，不造假 MP4 |
| Music：上传 > 合法库 > AI；禁止抓取版权曲 | ✅ |
| 真实 FFmpeg Render → MP4（9:16 / 16:9 / 1:1） | ✅ |
| 浏览器可播放预览 | ✅ `/api/video/render/file/[projectId]` |
| Credits + 预计消耗 + 确认后执行 + 防重复 | ✅ |
| 实际 30s 中文短视频 MP4 | ✅ Smoke |

---

## 2. 素材优先（示例）

目标 30 秒；3 张图片按动画覆盖 30 秒：

- `existingCoverageSec = 30`
- `aiRequiredCoverageSec = 0`
- **不调用**无限 AI 视频生成

---

## 3. Smoke 证据

命令：`npm run ai:smoke:v25`  
产物：

- `.nexa-data/ai-tests/v2.5-video-smoke.json`
- `.nexa-data/renders/v25_smoke_30s/export.mp4`（**356,728 bytes，时长 30.0s**）
- 预览 URL：`/api/video/render/file/v25_smoke_30s`

Timeline 轨道：Image×3 · Text×3 · Voice×3 · Music 已挂载。

---

## 4. Cost Protection

- `estimateVideoProductionCost` 显示预计 Credits（`generateVideo`）
- `ai_fill` / `render` / AI `regenerate_scene` 需 `confirm: true`
- 相同 `planFingerprint` 跳过重复高成本生成

---

## 5. 入口

创作项目内「视频工作台」：覆盖分析 → 分镜 → Timeline → 上传音乐 → 确认导出 → `<video>` 预览。

---

## 6. 说明

- AI Video Provider 仍依赖 `.env` 的媒体配置；本验收成片由 **已有素材 + FFmpeg** 真实渲染，符合「素材优先、不无限生成、真实 MP4」。
- 合法曲库仍为空占位；用户上传为最低可用音乐能力。
