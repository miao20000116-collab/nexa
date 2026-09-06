import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const SHOWCASE = join("data", "showcase");
mkdirSync(join(SHOWCASE, "creations"), { recursive: true });
mkdirSync(join(SHOWCASE, "workspaces"), { recursive: true });
mkdirSync(join(SHOWCASE, "source-ingest"), { recursive: true });

const now = new Date().toISOString();

const ws1 = {
  id: "ws_1788673467325_j8uwym3",
  userId: null,
  name: "西红柿炒鸡蛋 · 创作参考验收",
  status: "active",
  createdAt: "2026-09-06T05:44:27.325Z",
  updatedAt: now,
  sources: [
    {
      id: "src_1788673467328_v6jcf7y",
      workspaceId: "ws_1788673467325_j8uwym3",
      searchResultId: null,
      title: "西红柿炒鸡蛋家常做法参考（B站）",
      url: "http://www.bilibili.com/video/av1651436418",
      platform: "bilibili",
      sourceType: "video",
      snippet: "西红柿炒鸡蛋做法与常见误区参考",
      author: null,
      publishedAt: null,
      thumbnail: null,
      addedAt: "2026-09-06T05:44:27.328Z",
    },
  ],
  items: [],
  versions: [],
};

const ws2 = {
  id: "ws_1788675908892_llshfll",
  userId: null,
  name: "西红柿炒鸡蛋研究",
  status: "active",
  createdAt: "2026-09-06T06:25:08.892Z",
  updatedAt: now,
  sources: [
    {
      id: "src_1788675908896_fjbc6hh",
      workspaceId: "ws_1788675908892_llshfll",
      searchResultId: null,
      title: "西红柿炒鸡蛋，很多人第一步就做错了！教你正确做法",
      url: "https://zhuanlan.zhihu.com/p/1892861094340576101",
      platform: "web",
      sourceType: "web",
      snippet: "纠正先炒蛋/先炒西红柿的误区，讲解去皮与调味细节",
      author: null,
      publishedAt: null,
      thumbnail: null,
      addedAt: "2026-09-06T06:25:10.348Z",
    },
    {
      id: "src_1788675908901_hylgurs",
      workspaceId: "ws_1788675908892_llshfll",
      searchResultId: null,
      title: "教你做美味的西红柿炒鸡蛋，细节不到位就不好吃",
      url: "http://n.sinaimg.cn/sinacn17/377/w1777h1000/20180710/ff93-hezpzwu8652438.png",
      platform: "web",
      sourceType: "image",
      snippet: "糊锅与细节对比类参考封面",
      author: null,
      publishedAt: null,
      thumbnail:
        "http://n.sinaimg.cn/sinacn17/377/w1777h1000/20180710/ff93-hezpzwu8652438.png",
      addedAt: "2026-09-06T06:25:10.348Z",
    },
  ],
  items: [],
  versions: [],
};

const cp1Path = join(".nexa-data", "creations", "cp_1788673504290_eujpk2n.json");
const cp1 = JSON.parse(readFileSync(cp1Path, "utf8"));
cp1.userId = null;
cp1.updatedAt = now;
cp1.workspaceId = ws1.id;

const cp2 = {
  id: "cp_1788676054120_1pbolrt",
  userId: null,
  title: "西红柿炒鸡蛋，90%的人第一步就错！大厨教你正确做法",
  goal: "基于工作区资料生成短视频成片：西红柿炒鸡蛋正确做法",
  contentType: "short_video",
  platform: "douyin",
  status: "ready",
  brief: "纠正先炒蛋/先炒西红柿误区，强调开水焯西红柿去皮与蛋液调味。",
  workspaceId: ws2.id,
  startMode: "workspace",
  timeline: cp1.timeline,
  content: {
    title: "西红柿炒鸡蛋，90%的人第一步就错！大厨教你正确做法",
    hook: "你做的西红柿炒鸡蛋是不是要么汤汁太多，要么鸡蛋太老？先炒蛋还是先炒西红柿？其实第一步就错了！",
    body: "（镜头快速切换：一盘失败的西红柿炒鸡蛋，汤汁稀、鸡蛋老；另一盘完美的西红柿炒鸡蛋，色泽诱人）\n\n旁白/口播：别再争论先炒蛋还是先炒西红柿了，大厨说这两种顺序都不对！\n\n（镜头特写：西红柿放入沸水中）\n关键的第一步，是把西红柿放进开水里煮一分钟。这一步能轻松去皮，让西红柿更容易出沙，炒出来的汤汁才浓郁。\n\n（镜头：切块备用）\n接着打鸡蛋。重点来了，蛋液里加一点料酒和白胡椒粉，能去腥增香，这是很多人不知道的细节。\n\n（镜头：热锅冷油，滑炒鸡蛋）\n现在开始炒。先炒鸡蛋，炒到嫩滑定型就盛出来备用。\n\n（镜头：炒西红柿，加盐和少量清水）\n然后炒西红柿，记得加盐和一点点清水，这样才能把西红柿的汤汁充分煮出来。\n\n（镜头：倒入鸡蛋，混合翻炒收汁）\n最后把鸡蛋倒回去，快速翻炒几下，让鸡蛋裹满浓郁的西红柿汁，就可以出锅了。\n\n这样做出来的西红柿炒鸡蛋，鸡蛋鲜嫩，汤汁浓郁，开胃又下饭。",
    structure:
      "开场对比失败/成功 → 指出顺序误区 → 焯水去皮 → 蛋液调味 → 先蛋后茄混合收汁 → 成品 CTA",
    cta: "收藏起来按这个顺序试一次，评论区告诉我味道怎么样！",
    hashtags: ["西红柿炒鸡蛋", "家常菜", "下饭菜", "做饭技巧", "美食教程"],
    coverSuggestion:
      "左右对比：失败糊锅 vs 浓汁成品，大字「90%的人第一步就错」",
    __videoProject: {
      materialStrategy: "more_ai",
      coverage: {
        targetDurationSec: 30,
        existingCoverageSec: 0,
        ownedVideoSec: 0,
        imageAnimationSec: 0,
        aiRequiredCoverageSec: 30,
        aiVideoNeededSec: 30,
        mode: "more_ai",
        summary: "30 秒短视频成片（展示样本）",
      },
      storyboard: {
        script: "围绕「西红柿炒鸡蛋正确第一步」约 30 秒分镜。",
        shots: [
          {
            id: "shot_1",
            order: 1,
            durationSec: 5,
            description: "失败成品与成功成品对比特写",
            sourceType: "ai_video",
            subtitle: "90%的人第一步就错了",
            narration: "别再争论先炒蛋还是先炒西红柿，大厨说这两种都不对！",
          },
          {
            id: "shot_2",
            order: 2,
            durationSec: 5,
            description: "西红柿开水焯一分钟去皮",
            sourceType: "ai_video",
            subtitle: "先焯水去皮",
            narration: "关键第一步：西红柿开水煮一分钟，轻松去皮才容易出沙。",
          },
          {
            id: "shot_3",
            order: 3,
            durationSec: 5,
            description: "蛋液加料酒白胡椒",
            sourceType: "ai_video",
            subtitle: "蛋液去腥增香",
            narration: "蛋液里加一点料酒和白胡椒粉，炒出来更香。",
          },
          {
            id: "shot_4",
            order: 4,
            durationSec: 5,
            description: "先滑炒鸡蛋盛出，再炒西红柿出汁，最后混合",
            sourceType: "ai_video",
            subtitle: "混合收汁出锅",
            narration: "先炒蛋盛出，再炒西红柿出汁，最后混合翻炒，开胃下饭。",
          },
        ],
        musicStrategy: "Music Track 可选",
        subtitleStyle: "底部安全区，简体中文",
        narrationNotes: "口播可按分镜微调",
        updatedAt: "2026-09-06T06:33:07.149Z",
      },
      jobStatus: "failed",
      jobMessage: "即梦曾拒绝访问；文案与分镜已保留，可重新补镜头后导出。",
      previewUrl: null,
      exportUrl: null,
      playheadSec: 0,
    },
  },
  sources: [
    {
      id: "src_ref_1",
      kind: "workspace_source",
      workspaceId: ws2.id,
      title: "工作区资料",
    },
  ],
  promptOverride: null,
  createdAt: "2026-09-06T06:27:34.120Z",
  updatedAt: now,
  assets: [],
};

function writeBoth(rel: string, obj: unknown) {
  const show = join(SHOWCASE, rel);
  const live = join(".nexa-data", rel);
  mkdirSync(dirname(show), { recursive: true });
  mkdirSync(dirname(live), { recursive: true });
  const text = JSON.stringify(obj, null, 2);
  writeFileSync(show, text);
  writeFileSync(live, text);
  console.log("wrote", rel);
}

writeBoth("workspaces/ws_1788673467325_j8uwym3.json", ws1);
writeBoth("workspaces/ws_1788675908892_llshfll.json", ws2);
writeBoth("creations/cp_1788673504290_eujpk2n.json", cp1);
writeBoth("creations/cp_1788676054120_1pbolrt.json", cp2);

for (const id of [ws1.id, ws2.id]) {
  const src = join(".nexa-data", "source-ingest", `${id}.json`);
  if (existsSync(src)) {
    copyFileSync(src, join(SHOWCASE, "source-ingest", `${id}.json`));
    console.log("copied ingest", id);
  }
}

writeFileSync(
  join(SHOWCASE, "manifest.json"),
  JSON.stringify(
    {
      version: 1,
      description: "西红柿炒鸡蛋共享演示：全账号 + 游客可见",
      creations: [cp1.id, cp2.id],
      workspaces: [ws1.id, ws2.id],
      updatedAt: now,
    },
    null,
    2
  )
);
console.log("done");
