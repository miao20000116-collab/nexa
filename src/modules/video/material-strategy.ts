import type {
  MaterialCoverage,
  MaterialStrategyMode,
  TimelineDocument,
  TimelineScene,
  Storyboard,
  AspectRatio,
  MusicTrack,
} from "./types";

export interface OwnedAssetDurationInput {
  id: string;
  type: "video" | "image" | "audio" | "document" | string;
  durationSec?: number | null;
}

/** When duration was never probed, still credit owned video so shots bind media. */
const DEFAULT_OWNED_VIDEO_SEC = 8;

/**
 * Analyze how much of the target duration can be covered by owned assets
 * before requesting AI video for the gap only.
 */
export function analyzeMaterialCoverage(options: {
  targetDurationSec: number;
  assets: OwnedAssetDurationInput[];
  mode: MaterialStrategyMode;
  imageAnimationSecPerImage?: number;
}): MaterialCoverage {
  const perImage = options.imageAnimationSecPerImage ?? 3;
  const target = Math.max(1, options.targetDurationSec);

  let ownedVideoSec = 0;
  let imageCount = 0;
  for (const asset of options.assets) {
    if (asset.type === "video") {
      const d =
        asset.durationSec != null && asset.durationSec > 0
          ? asset.durationSec
          : DEFAULT_OWNED_VIDEO_SEC;
      ownedVideoSec += d;
    } else if (asset.type === "image") {
      imageCount += 1;
    }
  }

  const imageAnimationSecRaw = imageCount * perImage;

  // Cap owned coverage by target; AI fills the remainder.
  let usableVideo = Math.min(ownedVideoSec, target);
  let usableImages = Math.min(
    imageAnimationSecRaw,
    Math.max(0, target - usableVideo)
  );
  if (options.mode === "more_ai") {
    // Reserve more room for AI shots even when owned assets exist
    const reserveAi = Math.min(target * 0.4, target);
    const ownedBudget = target - reserveAi;
    const ownedTotal = usableVideo + usableImages;
    if (ownedTotal > ownedBudget && ownedTotal > 0) {
      const scale = ownedBudget / ownedTotal;
      usableVideo *= scale;
      usableImages *= scale;
    }
  } else if (options.mode === "prefer_owned") {
    // Prefer filling with owned first (already default)
  } else {
    // balanced: soft-cap owned at ~70%
    const ownedCap = target * 0.7;
    const ownedTotal = usableVideo + usableImages;
    if (ownedTotal > ownedCap && ownedTotal > 0) {
      const scale = ownedCap / ownedTotal;
      usableVideo *= scale;
      usableImages *= scale;
    }
  }

  usableVideo = round1(usableVideo);
  usableImages = round1(usableImages);
  const aiVideoNeededSec = round1(Math.max(0, target - usableVideo - usableImages));
  const existingCoverageSec = round1(usableVideo + usableImages);

  const summary = `${target} 秒：已有覆盖 ${existingCoverageSec} 秒（视频 ${usableVideo} + 图片动画 ${usableImages}）· AI 需补 ${aiVideoNeededSec} 秒`;

  return {
    targetDurationSec: target,
    existingCoverageSec,
    ownedVideoSec: usableVideo,
    imageAnimationSec: usableImages,
    aiRequiredCoverageSec: aiVideoNeededSec,
    aiVideoNeededSec,
    mode: options.mode,
    summary,
  };
}

/**
 * When generateVideo is off, stretch owned media to fill the full target
 * instead of leaving empty AI gap shots (which render as black synth).
 * Never invent multi-shot coverage from a single still — one image stays ≤3s.
 */
export function fillOwnedCoverageWhenAiUnavailable(
  coverage: MaterialCoverage,
  assets: OwnedAssetDurationInput[],
  aiVideoAvailable: boolean,
  aiImageAvailable = false
): MaterialCoverage {
  // Real T2V available — keep the AI gap; do not pave the timeline with stills
  if (aiVideoAvailable || coverage.aiVideoNeededSec <= 0) {
    return coverage;
  }

  // Image-only AI can Ken Burns unique stills later — keep gap for per-shot fill
  if (aiImageAvailable) {
    return coverage;
  }

  const imageCount = assets.filter((a) => a.type === "image").length;
  const videoCount = assets.filter((a) => a.type === "video").length;
  if (imageCount === 0 && videoCount === 0) return coverage;

  // Prefer stretching real video over inventing image animation with zero images
  if (videoCount > 0 && imageCount === 0) {
    const ownedVideoSec = round1(coverage.targetDurationSec);
    return {
      ...coverage,
      ownedVideoSec,
      imageAnimationSec: 0,
      existingCoverageSec: ownedVideoSec,
      aiVideoNeededSec: 0,
      aiRequiredCoverageSec: 0,
      summary: `${coverage.targetDurationSec} 秒：已有覆盖 ${ownedVideoSec} 秒（自有视频）· AI 视频未开启，已用自有素材铺满`,
    };
  }

  // Cap still coverage: at most ~3s per distinct image (no one-photo movie)
  const maxImageSec = round1(Math.min(imageCount * 3, coverage.targetDurationSec));
  const imageAnimationSec = round1(
    Math.min(
      maxImageSec,
      coverage.targetDurationSec - coverage.ownedVideoSec
    )
  );
  const existingCoverageSec = round1(
    coverage.ownedVideoSec + imageAnimationSec
  );
  const aiLeft = round1(
    Math.max(0, coverage.targetDurationSec - existingCoverageSec)
  );
  return {
    ...coverage,
    imageAnimationSec,
    existingCoverageSec,
    aiVideoNeededSec: aiLeft,
    aiRequiredCoverageSec: aiLeft,
    summary: `${coverage.targetDurationSec} 秒：已有覆盖 ${existingCoverageSec} 秒（视频 ${coverage.ownedVideoSec} + 图片动画 ${imageAnimationSec}）· AI 视频未开启，缺口 ${aiLeft}s 需补素材`,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Keep the final storyboard honest: its shot durations equal the requested target. */
export function normalizeStoryboardDuration(
  storyboard: Storyboard,
  targetDurationSec: number
): Storyboard {
  const target = round1(Math.max(1, targetDurationSec));
  if (!storyboard.shots.length) return storyboard;
  const total = storyboard.shots.reduce((sum, shot) => sum + shot.durationSec, 0);
  if (Math.abs(total - target) < 0.05) return storyboard;

  const scale = target / Math.max(total, 0.1);
  const shots = storyboard.shots.map((shot) => ({
    ...shot,
    durationSec: round1(Math.max(0.5, shot.durationSec * scale)),
  }));
  const normalizedTotal = shots.reduce((sum, shot) => sum + shot.durationSec, 0);
  shots[shots.length - 1].durationSec = round1(
    Math.max(0.5, shots[shots.length - 1].durationSec + target - normalizedTotal)
  );
  return {
    ...storyboard,
    shots,
    updatedAt: new Date().toISOString(),
  };
}

export function emptyMusicTrack(): MusicTrack {
  return {
    id: "music_main",
    sourceKind: "user_upload",
    assetId: null,
    url: null,
    title: undefined,
    license: null,
    bpm: null,
    beats: [],
    sections: [],
    scenes: [],
  };
}

export function emptyTimeline(
  aspectRatio: AspectRatio,
  durationSec: number
): TimelineDocument {
  const now = new Date().toISOString();
  return {
    version: 1,
    aspectRatio,
    durationSec,
    videoTrack: { id: "video", scenes: [] },
    imageTrack: { id: "image", scenes: [] },
    textTrack: { id: "text", scenes: [] },
    musicTrack: emptyMusicTrack(),
    voiceTrack: { id: "voice", scenes: [] },
    effectTrack: { id: "effect", scenes: [] },
    updatedAt: now,
  };
}

/** Build a draft timeline from an edited storyboard (no AI, no render). */
export function timelineFromStoryboard(
  storyboard: Storyboard,
  aspectRatio: AspectRatio,
  musicTrack?: MusicTrack
): TimelineDocument {
  const timeline = emptyTimeline(
    aspectRatio,
    storyboard.shots.reduce((s, sh) => s + sh.durationSec, 0)
  );
  if (musicTrack) timeline.musicTrack = musicTrack;

  let cursor = 0;
  for (const shot of storyboard.shots) {
    const start = cursor;
    const end = cursor + shot.durationSec;
    cursor = end;

    const scene: TimelineScene = {
      id: shot.id,
      track:
        shot.sourceType === "owned_image" || shot.sourceType === "image_animation"
          ? "image"
          : shot.sourceType === "text"
            ? "text"
            : "video",
      start,
      end,
      assetId: shot.assetId ?? null,
      sourceType: shot.sourceType,
      text: shot.subtitle,
      prompt: shot.description,
      animation:
        shot.sourceType === "image_animation" ? "kenburns" : undefined,
      transition: "cut",
      cutOnBeat: false,
    };

    if (scene.track === "image") timeline.imageTrack.scenes.push(scene);
    else if (scene.track === "text") timeline.textTrack.scenes.push(scene);
    else timeline.videoTrack.scenes.push(scene);

    if (shot.subtitle) {
      timeline.textTrack.scenes.push({
        ...scene,
        id: `${shot.id}_sub`,
        track: "text",
        sourceType: "text",
        text: shot.subtitle,
      });
    }

    // 配音文案：优先字幕（用户要求朗读字幕），否则旁白
    const voiceText = (shot.subtitle || shot.narration || "")
      .replace(/^旁白[：:]\s*/u, "")
      .trim();
    if (voiceText) {
      timeline.voiceTrack.scenes.push({
        id: `${shot.id}_voice`,
        track: "voice",
        start,
        end,
        sourceType: "voice",
        text: voiceText,
      });
    }
  }

  timeline.updatedAt = new Date().toISOString();
  return timeline;
}

export function createDraftStoryboard(options: {
  goal: string;
  coverage: MaterialCoverage;
  assets?: OwnedAssetDurationInput[];
  /** Structured script fields from creation project (title/hook/body/…) */
  scriptFields?: Record<string, string>;
}): Storyboard {
  const shots: Storyboard["shots"] = [];
  let order = 1;
  let remainingVideo = options.coverage.ownedVideoSec;
  let remainingImages = options.coverage.imageAnimationSec;
  let remainingAi = options.coverage.aiVideoNeededSec;

  const videoAssets = (options.assets ?? []).filter((a) => a.type === "video");
  const imageAssets = (options.assets ?? []).filter((a) => a.type === "image");
  let videoIdx = 0;
  let imageIdx = 0;

  const fields = options.scriptFields ?? {};
  const title = (fields.title || options.goal || "短视频").trim();
  const hook = (fields.hook || fields.opening || "").trim();
  const body = (fields.body || fields.script || fields.content || "").trim();
  const structure = (fields.structure || "").trim();
  const cta = (fields.cta || fields.callToAction || fields.hashtags || "").trim();

  type Beat = {
    label: string;
    description: string;
    subtitle: string;
    narration: string;
  };

  const beats: Beat[] = [];
  beats.push({
    label: "开场",
    description: hook
      ? `开场钩子画面：${hook.slice(0, 80)}`
      : `开场钩子：用前 3 秒抛出「${title.slice(0, 40)}」的冲突点`,
    subtitle: (hook || title).slice(0, 48),
    narration: hook ? `旁白：${hook.slice(0, 60)}` : `旁白：${title.slice(0, 40)}`,
  });

  const structureParts = structure
    .split(/[\n；;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, 4);
  const bodyParts = body
    .split(/\n+/)
    .map((s) => s.replace(/^\[.*?\]\s*/, "").trim())
    .filter((s) => s.length > 4)
    .slice(0, 5);

  if (structureParts.length >= 2) {
    for (const part of structureParts) {
      beats.push({
        label: "结构段",
        description: `段落画面：${part.slice(0, 90)}`,
        subtitle: part.slice(0, 48),
        narration: `旁白：${part.slice(0, 70)}`,
      });
    }
  } else if (bodyParts.length >= 2) {
    for (const part of bodyParts) {
      beats.push({
        label: "正文段",
        description: `口播对应画面：${part.slice(0, 90)}`,
        subtitle: part.slice(0, 48),
        narration: `旁白：${part.slice(0, 70)}`,
      });
    }
  } else {
    // Heuristic for 南北对比类目标
    if (/南北|对比|PK|差异/.test(title + options.goal + body)) {
      beats.push({
        label: "北方",
        description: "北方做法特写：重口 / 大火 / 典型调料入镜，突出差异点",
        subtitle: "北方这样炒",
        narration: "旁白：先看北方怎么做",
      });
      beats.push({
        label: "南方",
        description: "南方做法特写：清淡 / 细切 / 典型调料入镜，与北方对照",
        subtitle: "南方不一样",
        narration: "旁白：南方又是另一套",
      });
      beats.push({
        label: "对比",
        description: "分屏或快切对比：南北关键差异一眼可见",
        subtitle: "一眼看出差别",
        narration: "旁白：差别就在这几步",
      });
    } else {
      beats.push({
        label: "展开",
        description: `中段展开「${title.slice(0, 36)}」：展示关键步骤或卖点`,
        subtitle: title.slice(0, 48),
        narration: body
          ? `旁白：${body.slice(0, 60)}`
          : `旁白：展开说明${title.slice(0, 30)}`,
      });
      beats.push({
        label: "强化",
        description: "特写 / 结果画面：强化记忆点，准备收尾",
        subtitle: "记住这一点",
        narration: "旁白：关键就这一步",
      });
    }
  }

  beats.push({
    label: "收尾",
    description: cta
      ? `收尾互动：${cta.slice(0, 80)}`
      : "收尾互动：引导评论 / 收藏，画面留白给字幕",
    subtitle: (cta || "你站哪边？评论区见").slice(0, 48),
    narration: cta
      ? `旁白：${cta.slice(0, 60)}`
      : "旁白：你更喜欢哪种？评论区告诉我",
  });

  const push = (
    durationSec: number,
    sourceType: Storyboard["shots"][0]["sourceType"],
    beat: Beat,
    assetId?: string | null
  ) => {
    if (durationSec <= 0) return;
    shots.push({
      id: `shot_${order}`,
      order,
      durationSec: round1(durationSec),
      description: beat.description,
      sourceType,
      assetId: assetId ?? null,
      subtitle: beat.subtitle,
      narration: beat.narration,
    });
    order += 1;
  };

  const totalSlots =
    Math.ceil(remainingVideo / 5) +
    Math.ceil(remainingImages / 3) +
    Math.ceil(remainingAi / 5);
  const beatCount = Math.max(beats.length, Math.max(totalSlots, 1));
  // Expand beats if we need more shots than narrative beats
  while (beats.length < beatCount && beats.length < 12) {
    const i = beats.length;
    beats.push({
      label: `补充${i + 1}`,
      description: `补充镜头 ${i + 1}：承接上一镜节奏，画面角度/景别变化`,
      subtitle: `${title.slice(0, 24)} · ${i + 1}`,
      narration: `旁白：继续看第 ${i + 1} 点`,
    });
  }

  let beatIdx = 0;
  const nextBeat = () => beats[Math.min(beatIdx++, beats.length - 1)];

  while (remainingVideo > 0.05) {
    const chunk = Math.min(remainingVideo, 5);
    const asset = videoAssets[videoIdx++];
    const beat = nextBeat();
    push(
      chunk,
      "owned_video",
      {
        ...beat,
        description: `${beat.description}（用已有视频）`,
      },
      asset?.id ?? null
    );
    remainingVideo -= chunk;
  }
  while (remainingImages > 0.05) {
    const chunk = Math.min(remainingImages, 3);
    // One owned image → one shot only. Never recycle the same still across the timeline.
    const asset =
      imageIdx < imageAssets.length ? imageAssets[imageIdx++] : null;
    if (!asset) {
      // Leftover "image animation budget" becomes AI video slots instead of repeating stills
      remainingAi += remainingImages;
      remainingImages = 0;
      break;
    }
    const beat = nextBeat();
    push(
      chunk,
      "image_animation",
      {
        ...beat,
        description: `${beat.description}（图片动画）`,
      },
      asset.id
    );
    remainingImages -= chunk;
  }
  while (remainingAi > 0.05) {
    const chunk = Math.min(remainingAi, 5);
    const beat = nextBeat();
    push(chunk, "ai_video", {
      ...beat,
      description: `${beat.description}（待补 AI 镜头 ${chunk}s）`,
    });
    remainingAi -= chunk;
  }

  // If no coverage yet, still emit narrative beats as AI placeholders
  if (shots.length === 0) {
    const per = options.coverage.targetDurationSec / beats.length;
    for (const beat of beats) {
      push(Math.max(2, per), "ai_video", beat);
    }
  }

  return {
    script: [
      `围绕「${title}」约 ${options.coverage.targetDurationSec} 秒。`,
      `分镜按口播结构拆开（开场→展开→收尾），每镜画面/旁白不同；可编辑后再导出。`,
      `已有素材覆盖 ${options.coverage.existingCoverageSec}s，AI 缺口 ${options.coverage.aiRequiredCoverageSec}s。`,
    ].join(""),
    shots,
    musicStrategy:
      "Music Track 必需。优先级：①用户上传 ②合法曲库 ③AI Music。禁止抓取版权音乐。",
    subtitleStyle: "底部安全区，简体中文",
    narrationNotes:
      "各镜头旁白来自文案拆分，可改；默认即可用于时间线，导出仍需素材或 AI 补镜。",
    updatedAt: new Date().toISOString(),
  };
}
