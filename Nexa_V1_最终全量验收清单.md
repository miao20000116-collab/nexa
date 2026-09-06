# Nexa V1 最终全量验收清单

## 0. 验收规则

### 0.1 验收目标

本次验收的目标不是确认“代码写完了”，而是确认：

> **Nexa 是否已经成为一个真实、完整、可使用、逻辑闭环、视觉统一的 AI Search + Research + Creation + Commerce 产品。**

必须从用户视角进行验收。

不能只检查：

* Component 是否存在
* API Route 是否存在
* 数据库表是否存在
* Button 是否可以点击
* Build 是否通过

必须检查：

> **用户点击以后，最终有没有得到正确结果。**

---

## 0.2 验收结果等级

所有问题统一分为：

### P0｜阻断问题

出现以下情况直接判定 V1 不通过：

* 页面无法访问
* 核心功能无法使用
* 搜索返回明显错误结果
* 伪造真实数据
* 伪造 AI 结果
* 伪造发布成功
* 用户可以看到或配置 API Key
* 用户可以访问其他用户数据
* 关键数据计算错误
* 核心流程无法闭环
* 页面存在严重 UI 崩坏
* AI 输出与输入完全无关
* Commerce 数据明显造假且未标注 Demo
* AI 任务显示完成但实际没有生成结果

### P1｜重要问题

不阻断产品使用，但明显影响 V1：

* 某个模块流程不完整
* 搜索结果相关性较差
* AI 输出质量不稳定
* Workspace 联动异常
* 素材识别不准确
* 视频 Timeline 错误
* 发布前检查缺失
* 数据指标解释不清
* 页面信息层级混乱
* Loading / Error 状态不合理

### P2｜优化问题

主要影响：

* 视觉细节
* 文案
* 间距
* 动画
* 小交互
* 信息密度
* 边角体验

---

# 1. 产品整体结构验收

确认一级导航是否符合最终定义：

```text
Nexa

搜索
工作区
创作
跨境商业

账户
```

确认没有出现不应该存在的一级菜单：

```text
AI工具箱
Agent中心
Prompt中心
模型中心
Workflow
素材库
发布中心
```

其中：

* 素材属于创作体系
* 发布属于执行体系

---

# 2. 首页验收

## 2.1 首页视觉

重点检查首页。

必须确认：

* 第一屏是否有明确视觉焦点
* 搜索框是否为核心
* 页面是否显得高级、克制
* 是否存在过度留白
* 是否存在过度拥挤
* 是否存在大量无意义 Card
* 是否像 AI 产品，而不是后台系统
* 是否像搜索产品，而不是 SaaS Dashboard
* 是否与其他页面视觉统一

### 特别检查

不要出现：

* 巨大三卡片
* 大面积渐变
* 玻璃拟态
* 大量阴影
* 超大圆角
* 彩色 Dashboard
* 工程化标签

---

# 3. 首页核心输入验收

输入：

> 什么是 RAG？

检查是否进入搜索。

输入：

> 研究美国最近90天的 AI眼镜市场。

检查是否进入 Research。

输入：

> 帮我做一条旅行主题短视频。

检查是否进入 Creation。

输入：

> 为什么我的 Portable Blender 最近卖得不好？

检查是否进入 Commerce。

输入：

> 用我上传的照片做一篇小红书。

检查是否进入 Creation + Asset Context。

---

# 4. 全局中文验收

整个产品逐页面检查。

所有用户可见普通 UI 默认使用：

**简体中文。**

允许保留：

```text
Prompt
RAG
API
Token
LLM
OAuth
ASIN
SKU
GMV
CTR
CVR
ACOS
ROAS
JSON
Embedding
```

不应该出现：

```text
Create
Search
Dashboard
Workspace
Upload
Generate
Publish
Settings
Provider
Model
API Key
```

如果不是必要的专业术语，应中文化。

---

# 5. 搜索基础验收

测试以下查询：

```text
什么是 RAG？

OpenAI

OpenAI 最近有什么新闻？

AI眼镜

美国 AI眼镜市场

Amazon FBA

人工智能最近有什么新闻？

X 上最近大家怎么看 AI Agent？

AI眼镜评测视频

AI眼镜图片
```

每一个都检查：

* 是否有结果
* 结果是否真实
* 是否与 Query 相关
* 标题是否正确
* URL 是否真实
* 时间是否真实
* 来源是否正确
* 缩略图是否正确
* 点击是否能打开真实来源

---

# 6. 搜索错误相关性验收

这是非常重要的一项。

测试：

> 什么是 RAG？

绝对不能再次出现：

> President of China

测试：

> 什么是 AI Agent？

检查是否出现明显无关内容。

测试：

> 美国 AI眼镜市场

检查是否大量出现单纯“AI”相关新闻。

原则：

> **宁可少结果，也不要明显错误结果。**

---

# 7. 搜索来源验收

确认系统能够区分：

* Web
* Wikipedia
* News
* X
* Video
* Image
* Social
* Forum

但是：

### UI 不要求用户看到工程 Provider。

不能出现：

> SearXNG Provider

> Wikipedia Provider

> Bing Engine

> Search API

等工程信息。

---

# 8. Search Ranking 验收

不要只检查“有没有结果”。

检查排序是否符合搜索意图。

### Query：

> 什么是 RAG？

应该更重视：

* Wikipedia
* 官方技术资料
* 技术文章

### Query：

> OpenAI 最近有什么新闻？

应该更重视：

* 最新新闻
* 官方信息
* 时间较新的内容

### Query：

> 大家怎么看 AI Agent？

应该更重视：

* X
* Reddit
* 视频
* 评论类文章

### Query：

> OpenAI API 怎么调用？

应该优先：

* 官方文档
* GitHub
* 技术资料

---

# 9. AI Overview 验收

如果 AI API 已接入：

输入：

> 什么是 RAG？

检查 AI Overview 是否：

* 使用真实搜索资料
* 回答问题
* 与 Query 相关
* 有引用
* 引用真实存在
* 引用能够打开
* 不凭空编造

测试：

> OpenAI 最近有什么新闻？

检查：

* 是否使用最新资料
* 是否混淆历史信息
* 是否引用来源

---

# 10. AI Overview 幻觉验收

故意搜索：

> 2026年某个不存在的产品发生了什么？

检查：

AI 是否会直接编造。

正确行为应该是：

> 暂未找到可靠资料。

而不是：

> “该产品于2026年正式发布……”

---

# 11. Search → Workspace

搜索：

> AI眼镜

选择至少：

* 2 条 Web
* 2 条 X / Social
* 1 条 Video

加入工作区。

检查：

* 是否加入成功
* 数量是否正确
* 来源是否正确
* 标题是否正确
* URL 是否正确

---

# 12. Workspace 跨搜索验收

Search A：

> AI眼镜

加入 3 条。

Search B：

> AI眼镜 用户吐槽

加入 3 条。

Search C：

> AI glasses review

加入 3 条。

进入 Workspace。

必须看到：

> 9 条资料。

而不是每次搜索覆盖之前内容。

---

# 13. Workspace 操作验收

检查：

* 添加资料
* 删除资料
* 打开来源
* 继续搜索
* 总结
* 对比
* 深入研究
* 创建内容

全部必须有明确反馈。

---

# 14. Workspace AI 验收

输入：

> 这些资料里最大的5个用户痛点是什么？

检查：

AI 是否只基于 Workspace 资料回答。

再输入：

> 哪些观点存在明显冲突？

检查：

是否能引用对应资料。

---

# 15. Deep Research 验收

测试：

> 研究美国最近90天 AI眼镜市场。

检查流程：

```text
研究目标
↓
拆解问题
↓
搜索
↓
读取资料
↓
去重
↓
聚类
↓
分析
↓
交叉验证
↓
研究报告
```

---

# 16. Deep Research 报告结构

检查是否包含：

* 研究结论
* 核心发现
* 关键证据
* 趋势
* 不同观点
* 风险
* 机会
* 资料来源

不要输出一大段没有结构的 AI 长文。

---

# 17. Research 引用验收

随机点击报告中的引用。

必须：

* 真实存在
* 能打开
* 与引用内容相关

不能出现：

> 来源：某某网站

但 URL 不存在。

---

# 18. 素材库验收

上传：

* JPG
* PNG
* MP4
* 音频
* 文档

检查：

```text
上传中
↓
处理中
↓
已就绪
```

失败时：

```text
处理失败
重新处理
```

---

# 19. 图片素材 AI 分析

上传一张商品图。

检查未来 AI 接入后能够识别：

* 主体
* 商品
* 场景
* 构图
* 角度
* 文字
* 质量
* 用途

---

# 20. 视频素材 AI 分析

上传视频。

检查系统是否生成：

* Proxy
* Transcript
* Keyframes
* Scene
* Metadata

重点：

**不能每次 AI 查询都重新上传整个原始视频。**

---

# 21. 智能找素材

测试：

> 找出所有机场场景的 Blender 素材。

测试：

> 找出适合做视频开头的素材。

测试：

> 找出画面最干净的商品图片。

检查是否基于素材 Metadata / AI 分析进行检索。

---

# 22. 内容创作入口

测试四个入口：

```text
从想法开始
从搜索结果开始
从工作区开始
从我的素材开始
```

每个入口都必须能够正确进入 Creation Context。

---

# 23. 图文创作验收

测试：

> 根据这些 AI眼镜资料，写一篇小红书。

检查输出：

```text
标题
正文
Hashtags
封面文案
图片规划
```

每一个字段都可以单独编辑。

---

# 24. 平台适配验收

同一个内容分别适配：

* 小红书
* X
* Instagram
* TikTok
* LinkedIn

检查：

是否根据平台特性调整：

* 标题
* 长度
* 表达
* Hashtag
* 结构

不是简单翻译。

---

# 25. AI 局部修改

测试：

> 优化标题

> 更自然一点

> 更专业一点

> 缩短

> 增加信息密度

检查：

**只修改当前区域。**

不能整个项目重新生成。

---

# 26. 图片生成验收

测试：

> 用这张商品图生成一个机场旅行场景。

检查：

* 商品主体是否一致
* 场景是否合理
* 构图是否符合目标
* 图片比例是否正确
* 是否能够重新生成

---

# 27. 视频生成验收

测试：

> 用我的 Blender 素材制作一条30秒旅行主题短视频。

检查：

系统是否首先分析：

```text
已有视频
已有图片
需要补充的视频
音乐
字幕
```

而不是直接生成：

> 6段AI视频。

---

# 28. 视频素材预算验收

例如：

```text
用户视频：13秒
图片动画：7秒
AI视频：10秒
```

检查系统是否能体现：

> 现有素材可覆盖20秒，仅需生成约10秒。

---

# 29. Storyboard 验收

视频生成前检查：

* 镜头1
* 镜头2
* 镜头3
* 镜头4
* 镜头时长
* 素材
* 字幕
* 音乐

用户必须能够：

* 替换素材
* 删除镜头
* 修改字幕
* 修改时长

---

# 30. Timeline 验收

检查是否存在：

```text
Video Track
Image Track
Text Track
Music Track
Voice Track
Effect Track
```

检查 Scene 3 重新生成后：

**不能导致整个视频重新生成。**

---

# 31. 音乐验收

最低要求：

> 用户可以上传自己的音乐。

上传音乐后：

检查：

* 音频正常播放
* 可以加入 Timeline
* 可以裁剪
* 可以调整音量
* 可以替换

如果 AI Music API 已接入：

测试：

> 生成一段适合旅行视频的音乐。

---

# 32. 音乐与视频同步

如果支持 Beat Detection：

检查：

* BPM
* Beat
* 高潮
* Intro
* Outro

检查视频切点是否能够与音乐节奏结合。

---

# 33. 视频最终渲染

检查：

* 9:16
* 1:1
* 16:9

分别导出。

检查：

* 视频能播放
* 音乐正常
* 字幕正常
* 画面不变形
* 音画同步
* 没有黑屏
* 没有异常帧

---

# 34. 异步任务验收

测试：

* Deep Research
* 图片批量生成
* 视频生成
* 音乐生成
* 最终 Render

必须支持：

```text
queued
processing
generating
rendering
quality_check
completed
failed
```

用户关闭页面后重新进入：

任务状态仍然存在。

---

# 35. 内容 QA

生成内容后检查：

### 事实一致性

是否与来源一致。

### 素材风险

是否错误使用第三方图片。

### 平台规范

是否符合平台格式。

### 内容安全

是否存在明显风险。

### 商业信息

商品名称、价格、规格是否一致。

不要只输出：

> 内容评分：86分。

必须告诉用户：

> 通过

或者：

> 需要修改

并说明原因。

---

# 36. 发布中心

检查：

```text
Creation
↓
QA
↓
Preview
↓
User Confirmation
↓
Publish
```

不能：

> 生成完自动发布。

---

# 37. OAuth 验收

检查：

用户连接平台时：

只能使用 OAuth。

绝对不能要求用户填写：

* API Key
* Access Token
* App Secret
* Base URL

---

# 38. 发布真实性

如果平台真正支持：

执行真实发布。

检查：

* 返回真实状态
* externalPostId
* 发布时间

如果平台没有权限：

必须显示：

> 当前平台暂不支持此发布方式。

不能：

> 发布成功！

---

# 39. 发布失败

人为制造：

OAuth 失效。

检查：

是否显示：

> 账号授权已失效，请重新连接。

而不是：

```text
401 Unauthorized
OAuthException
API Error
Stack Trace
```

---

# 40. Amazon Demo

进入：

> 跨境商业 → Amazon

确认明确显示：

> Demo Store / 演示数据

---

# 41. Amazon 经营概览

检查：

* 销售额
* Orders
* Sessions
* CVR
* Ad Spend
* Profit

必须来自数据库计算。

不能直接写死：

> 销售额 -18.2%

---

# 42. Amazon 商品诊断

测试：

> Portable Blender

检查是否能够发现：

```text
销售额下降
流量变化
CVR变化
广告变化
```

结构必须：

> 结论 → 证据 → 下一步

---

# 43. Amazon 诊断计算

检查：

```text
销售额
=
流量 × CVR × 客单价
```

确认：

销售下降到底来自：

* 流量
* 转化
* 客单价

而不是 AI 随便猜。

---

# 44. Amazon 广告诊断

检查：

* Campaign
* Search Terms
* Product
* Placement

Search Terms：

* Spend
* Clicks
* Orders
* Sales
* CVR
* ACOS
* ROAS

检查异常：

高花费低转化。

高转化增长词。

---

# 45. Amazon 利润

验证：

```text
Revenue
- Ad Spend
- Platform Fee
- FBA
- Logistics
- Refund
- COGS
=
Estimated Profit
```

必须明确：

> 预计利润

> 演示数据

---

# 46. Amazon 库存

检查：

* 当前库存
* 日均销量
* 库存覆盖天数
* 风险

不要出现复杂：

ERP
WMS
采购系统。

---

# 47. Amazon → Search

商品诊断中：

> 研究 Travel 场景机会

点击。

必须进入真实 Search。

搜索：

> Portable Blender Travel

然后：

> 加入工作区

再：

> 创建内容

---

# 48. TikTok Shop

进入：

> 跨境商业 → TikTok Shop

必须显示：

> Demo Store / 演示数据

---

# 49. TikTok Shop 内容经营

检查：

* 视频
* Views
* Product Clicks
* Orders
* GMV
* CVR

验证是否能够发现：

> 播放量不一定最高，但转化率最高的内容。

---

# 50. TikTok Creator

检查：

* Creator
* Videos
* GMV
* Orders
* CVR

AI 应能够分析：

> 哪些内容值得复制。

---

# 51. TikTok → Search → Create

验证：

```text
TikTok Content
↓
研究 Travel 热门内容
↓
Search
↓
Workspace
↓
Create
↓
Video
```

整个链路必须成立。

---

# 52. Amazon 与 TikTok 数据逻辑

检查：

Amazon 与 TikTok 数据不能全部一样。

必须体现不同商业特征。

Amazon：

* 搜索
* 广告
* Listing
* Conversion

TikTok：

* 视频
* Creator
* 内容
* 流量
* 内容转化

---

# 53. 跨境商业 AI 输入

Amazon：

> 为什么这个商品最近卖差了？

TikTok：

> 为什么这个视频转化率这么高？

检查 AI 是否自动获得当前页面 Context。

用户不需要重新告诉 AI：

> 我正在看哪个商品。

---

# 54. Guest 验收

未登录用户：

允许：

* 搜索
* 查看真实搜索结果
* 临时 Workspace
* 查看 Demo Commerce

不允许：

* 长期保存
* 发布
* 连接账号
* 某些高成本 AI 操作

---

# 55. 用户隔离

创建：

User A

User B

验证：

A 无法：

* 查看 B Workspace
* 查看 B Assets
* 查看 B Credits
* 查看 B Publish Record

---

# 56. API 安全验收

检查浏览器 Network。

确认：

**绝对不能出现：**

```text
API Key
LLM API Key
Search API Key
OAuth Secret
Provider Secret
```

所有敏感 Key 必须 Server-side。

---

# 57. 用户绝对不能配置 API

全站搜索：

```text
API Key
API Token
Base URL
Provider
Model ID
Endpoint
```

如果出现在用户设置页面：

**P0 失败。**

---

# 58. AI Provider 验收

检查：

业务代码不能直接：

```text
callQwen()
callGemini()
callOpenAI()
```

应该：

```text
AIGateway
↓
CapabilityRouter
↓
Provider
```

---

# 59. Model Router

检查：

业务层调用：

```text
generateImage()
generateVideo()
generateText()
analyzeImage()
```

而不是：

```text
Gemini Veo
Qwen xxx
```

---

# 60. AI API 未连接状态

如果 AI API 暂时不可用：

必须显示：

> AI 服务暂时不可用，请稍后再试。

或者：

> AI 服务暂未接入。

不能：

> 正在分析……

然后永远停在那里。

---

# 61. Search API 不花钱原则

确认 Search 没有依赖：

* 付费 Web Search API
* 用户自己配置 API

当前通过：

> SearXNG + 可用公开搜索源

实现真实搜索。

---

# 62. X / 小红书 / TikTok

必须区分：

### 能通过真实搜索获取

展示真实结果。

### 当前无法获取

显示：

> 暂未找到相关公开内容。

或者：

> 当前暂不支持该来源的直接检索。

绝对不能生成假的帖子。

---

# 63. 数据真实性

逐个检查：

Search：

真实。

X：

真实。

Video：

真实。

Image：

真实。

AI：

真实。

Publishing：

真实。

只有：

Amazon Demo

TikTok Shop Demo

允许 Mock。

---

# 64. 数据源性质 UI

这一点按照你现在最终确定的产品原则：

**不要在普通用户界面增加大量“这是 Mock / 这是 API / 这是 Provider”的工程标签。**

但是对于：

> Amazon Demo Store / TikTok Shop Demo Store

必须明确告诉用户这是**演示数据**，因为这是业务真实性边界。

---

# 65. Loading 状态

逐页面检查。

不能出现：

> 加载中……

无限旋转。

必须有：

* Skeleton
* 进度
* 状态
* 失败
* 重试

---

# 66. Empty State

分别测试：

无搜索结果。

无 Workspace。

无素材。

无创作项目。

无发布记录。

无连接账号。

必须显示有意义的中文空状态。

不能：

> No Data

或者：

> 暂无数据。

然后什么都没有。

---

# 67. Error State

测试：

Search Provider 失败。

AI Provider 失败。

Storage 失败。

Render 失败。

OAuth 失败。

数据库失败。

必须：

用户看到友好中文。

服务器日志保留技术错误。

---

# 68. 防重复提交

连续点击：

> 生成

检查是否产生多个重复 Job。

连续点击：

> 发布

不能发布两次。

---

# 69. 长任务

测试视频生成期间：

* 刷新
* 离开页面
* 返回页面

任务不能丢失。

---

# 70. 浏览器刷新

测试：

Search

Workspace

Creation

Commerce

刷新页面。

不能：

* 数据消失
* 页面白屏
* 状态错误

---

# 71. 返回上一页

测试：

Search

→ Workspace

→ Creation

→ Back

检查：

之前的 Context 是否仍然存在。

不能每次 Back 都重新生成。

---

# 72. 页面响应式

至少检查：

Desktop

1440px

1280px

1024px

移动端：

390px

768px

重点页面：

* 首页
* Search
* Workspace
* Creation

不能：

* 横向溢出
* 搜索框跑出屏幕
* Card 被截断
* Button 消失

---

# 73. UI 一致性

检查：

按钮

输入框

Tab

Card

Modal

Drawer

Toast

Typography

Spacing

全部统一。

---

# 74. UI 信息层级

逐页检查：

用户是否能在3秒内知道：

> 我现在在哪里？

> 这里有什么？

> 下一步做什么？

如果用户需要阅读大量文字才能理解页面：

P1。

---

# 75. Search UI 特别验收

搜索结果页不能：

* AI 长文占满第一屏
* 用户找不到真实结果
* 卡片过重
* 信息密度过低
* 来源全部长得一样

应该体现：

> AI Overview + 信息流 + Workspace

---

# 76. Creation UI 特别验收

不能变成：

> Prompt 输入框 + Generate Button

必须体现：

> 内容规划 → 素材 → 编辑 → 预览 → QA → 发布

---

# 77. Commerce UI 特别验收

不能变成：

> 数据 Dashboard + AI Chat

必须体现：

> 数据 → 问题 → 证据 → 诊断 → 下一步

---

# 78. Token / Credits

用户界面：

统一：

> AI Credits

不要：

> Token消耗 23,451

---

# 79. Credits 逻辑

检查：

AI 操作产生消费。

Ledger 有记录。

余额正确。

失败任务：

不能错误扣费。

或者根据产品策略正确处理退款。

---

# 80. 高成本任务

视频 / 批量图片 / Deep Research / 音乐：

执行前如果已经确定真实成本：

显示预计：

> 预计消耗约 XX Credits

但不能为了展示而编一个数字。

---

# 81. SEO / 分享

如果产品存在公开分享页面：

检查：

只有用户主动公开的内容才能被访问。

Private Workspace：

不能被搜索引擎访问。

不能泄露：

* Search History
* Private Assets
* Private Creation
* Commerce Data

---

# 82. 隐私

检查：

用户上传的：

图片

视频

文档

不能被其他用户访问。

URL 不应无保护地暴露私有文件。

---

# 83. 数据删除

测试删除：

Asset

Workspace

Creation

Publish Record

检查：

是否符合产品预期。

不能出现：

UI 删除了，但数据库仍被错误引用导致页面崩溃。

---

# 84. 数据库一致性

检查：

WorkspaceSource 删除后。

SearchResult 不应该被误删除。

OwnedAsset 删除后。

CreationProject 应该正确处理引用。

PublishRecord 不应因为 UI 删除而产生错误状态。

---

# 85. Job 系统

检查所有 Job：

```text
created
queued
running
completed
failed
```

失败 Job：

必须有：

errorCode

errorMessage

retryable

---

# 86. 性能验收

Search：

不能因为某个 Provider 慢而阻塞所有结果。

应该尽量：

> 并行搜索。

---

# 87. AI 性能

检查：

不要把整个搜索结果库直接丢给 LLM。

不要把整个视频无限重复上传。

不要把所有素材全部送给 Vision。

必须：

> 先筛选，再 AI 深度处理。

---

# 88. 视频成本

验证：

用户已有素材时：

AI 只生成缺失部分。

不能每次：

> 重新生成整个30秒视频。

---

# 89. Provider 故障

关闭某一个 Provider。

检查：

Search 是否仍然可以返回其他来源。

如果核心服务全部不可用：

必须明确：

> 搜索服务暂时不可用。

而不是展示假的结果。

---

# 90. 第三方限制

逐个平台检查：

### X

搜索能力。

### TikTok

搜索 / 发布能力。

### 小红书

搜索 / 发布能力。

### Instagram

搜索 / 发布能力。

### YouTube

搜索 / 发布能力。

对于没有权限的：

> 暂未支持。

不能绕过。

---

# 91. Commerce Demo 边界

检查 Amazon / TikTok Shop 页面。

必须：

> 演示数据

但是：

指标计算、趋势分析、异常检测必须是真实逻辑。

---

# 92. Demo 数据质量

不能所有商品：

> 销售增长

不能所有广告：

> 表现优秀

不能所有视频：

> 转化提升

必须存在：

* 增长
* 下降
* 异常
* 机会
* 风险

---

# 93. AI 诊断可信度

AI 给出：

> CVR下降是主要原因。

必须能找到：

对应指标。

不能：

> AI感觉这个商品表现不好。

---

# 94. AI 建议可执行性

不要：

> 建议优化营销策略。

应该：

> 建议研究 Travel 场景，并围绕“机场便携 / 清洗方便 / 电池续航”制作3条内容。

也就是说：

> **诊断必须能进入下一步行动。**

---

# 95. Commerce → Creation

Amazon：

> 找到 Travel 机会

点击：

> 创建内容

检查是否自动带入：

* 商品
* 场景
* 研究资料
* 商品素材

---

# 96. Search → Creation

搜索：

> AI眼镜

选择资料。

点击：

> 基于这些内容创作

Creation 必须自动获得：

* Search Sources
* Workspace Context

---

# 97. Assets → Creation

选择：

3张商品图

点击：

> 创建内容

Creation 自动获得：

3个 Owned Assets。

---

# 98. Creation → Publish

内容生成：

→ QA

→ Preview

→ Publish

中间不能断链。

---

# 99. Publish → Future Feedback

如果平台返回真实发布信息：

保存：

* externalPostId
* publishedAt
* platform

未来可以作为 Performance 数据入口。

V1 不需要过度扩展。

---

# 100. 全产品核心 Demo 验收

最后必须亲自完整走一遍：

## Demo A：普通用户

输入：

> 研究美国最近90天 AI眼镜市场。

然后：

```text
Search
↓
真实结果
↓
加入 Workspace
↓
Deep Research
↓
研究报告
↓
创建小红书
↓
使用自己的图片
↓
生成内容
↓
QA
↓
Preview
```

整个流程不能断。

---

# 101. Demo B：内容创作者

```text
上传：
3张图片
1段视频
1首音乐

↓

创建短视频

↓

AI理解素材

↓

Storyboard

↓

Timeline

↓

音乐

↓

AI补充缺失镜头

↓

Render

↓

QA

↓

Preview
```

---

# 102. Demo C：Amazon

完整走：

```text
跨境商业
↓
Amazon
↓
经营概览
↓
Portable Blender
↓
AI诊断
↓
发现 CVR 下降
↓
研究 Travel 机会
↓
Search
↓
Workspace
↓
Creation
↓
使用商品素材
↓
生成内容
```

---

# 103. Demo D：TikTok Shop

```text
TikTok Shop
↓
内容经营
↓
发现机场主题 CVR 高
↓
研究 Travel
↓
Search
↓
Workspace
↓
生成3条视频
↓
使用音乐
↓
QA
↓
Publish
```

---

# 104. 最终 Build

执行：

```bash
npm run lint
npm run typecheck
npm run build
```

如果项目存在测试：

```bash
npm test
```

或者：

```bash
npm run test
```

同时检查：

* Console Error
* Network Error
* 404
* 500
* hydration error
* unhandled promise rejection

---

# 105. 最终代码检查

搜索整个项目：

```text
TODO
FIXME
MOCK
mock
fake
dummy
placeholder
hardcoded
test data
```

逐个检查。

注意：

**Commerce Demo Data 是允许存在的。**

但是：

Search Fake Data

AI Fake Data

Fake X Posts

Fake Image Results

Fake Video Results

Fake Publish Success

全部禁止。

---

# 106. API 环境变量检查

检查 `.env` / `.env.example`。

允许存在平台方配置：

```text
AI Provider Key
Database
Storage
OAuth Secret
SearXNG
```

但是：

这些不能进入用户前端。

---

# 107. API Key 泄漏检查

检查：

* Git
* Client Bundle
* Browser Network
* Local Storage
* Session Storage
* Cookies

不能出现平台方 Secret。

---

# 108. 最终产品定位验收

问一个第一次使用的人：

> “你觉得 Nexa 是什么？”

理想答案应该接近：

> “一个可以搜索和研究信息，并直接把信息变成内容甚至执行商业工作的 AI 产品。”

而不是：

> “一个 AI 搜索网站。”

也不是：

> “一个 Amazon Dashboard。”

也不是：

> “一个 AI 视频生成器。”

---

# 109. 最终核心价值验收

必须验证 Nexa 是否真正实现：

### Search

> 帮我找到信息。

### Understand

> 帮我理解信息。

### Workspace

> 帮我组织信息。

### Research

> 帮我形成判断。

### Create

> 帮我把判断变成内容。

### Publish

> 帮我执行。

### Commerce

> 帮我把信息和内容连接到生意。

---

# 110. 最终 P0 验收红线

以下任意一项失败：

> **V1 不通过。**

```text
□ 搜索结果伪造
□ X内容伪造
□ 图片结果伪造
□ 视频结果伪造
□ AI结果伪造
□ 发布成功伪造
□ 用户需要配置API
□ API Key暴露前端
□ 用户数据越权
□ 核心 Search 无法使用
□ Workspace 无法保存
□ Creation 无法进入
□ Commerce 数据计算错误
□ Demo 数据未明确边界
□ AI诊断与证据不一致
□ 视频生成结果无法播放
□ 发布流程无法完成
□ 核心流程无法闭环
```

---

# 111. 最终验收报告格式

最后不要让 Cursor 只告诉我们：

> Build Passed.

必须让它输出：

```markdown
# Nexa V1 Final Acceptance Report

## 1. 总体结论

通过 / 有条件通过 / 不通过

## 2. P0 问题

| 问题 | 页面 | 复现步骤 | 严重程度 | 建议 |
|---|---|---|---|---|

## 3. P1 问题

| 问题 | 页面 | 复现步骤 | 严重程度 | 建议 |
|---|---|---|---|---|

## 4. P2 问题

| 问题 | 页面 | 建议 |
|---|---|---|

## 5. Search

真实搜索：
通过 / 失败

相关性：
通过 / 失败

来源：
通过 / 失败

X：
通过 / 失败

图片：
通过 / 失败

视频：
通过 / 失败

## 6. Workspace

通过 / 失败

## 7. Deep Research

通过 / 失败

## 8. Assets

通过 / 失败

## 9. Creation

通过 / 失败

## 10. Image Generation

通过 / 失败

## 11. Video

通过 / 失败

## 12. Music

通过 / 失败

## 13. QA

通过 / 失败

## 14. Publishing

通过 / 失败

## 15. Amazon

通过 / 失败

## 16. TikTok Shop

通过 / 失败

## 17. Account

通过 / 失败

## 18. Credits

通过 / 失败

## 19. Security

通过 / 失败

## 20. API Security

通过 / 失败

## 21. Performance

通过 / 失败

## 22. Responsive UI

通过 / 失败

## 23. Build

Lint：
PASS / FAIL

Typecheck：
PASS / FAIL

Build：
PASS / FAIL

Tests：
PASS / FAIL

## 24. 核心闭环

Search
→ Workspace
→ Research
→ Creation
→ QA
→ Publish

PASS / FAIL

## 25. 商业闭环

Commerce
→ Diagnose
→ Search
→ Workspace
→ Creation
→ Publish

PASS / FAIL

## 26. 最终建议

必须明确：

是否已经达到 V1 Demo 标准

是否可以开始真实用户测试

是否可以开始作品集展示

是否还有 P0 阻断问题
```

---

## 验收执行说明

第一轮验收原则：

> **只检查 → 记录问题 → 分类 P0/P1/P2 → 不修改代码。**
