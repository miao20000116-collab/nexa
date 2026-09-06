/**
 * Creation pack from workspace「提取要点」—
 * natural notes +口播 / 分镜 / image prompts for handoff to create.
 */

export type CreationPackShotSource = "observed" | "inferred";

export type CreationPackShot = {
  description: string;
  subtitle: string;
  narration: string;
  durationSec: number;
  imagePrompt: string;
  source: CreationPackShotSource;
};

export type CreationPack = {
  hook: string;
  narration: string;
  styleNotes: string;
  musicMood: string;
  shots: CreationPackShot[];
};

export type ParsedExtractResult = {
  notes: string;
  pack: CreationPack | null;
  /** Raw model text when pack JSON is missing or broken */
  raw: string;
};

const EXTRACT_SHOTS_KEY = "__extractShots";

export { EXTRACT_SHOTS_KEY };

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function asSource(v: unknown): CreationPackShotSource {
  if (v === "observed" || v === "资料已见") return "observed";
  return "inferred";
}

function normalizeShot(raw: unknown): CreationPackShot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const description = asString(o.description ?? o.画面描述);
  const imagePrompt = asString(o.imagePrompt ?? o.prompt ?? o.画面prompt);
  const narration = asString(o.narration ?? o.旁白 ?? o.口播);
  if (!description && !imagePrompt && !narration) return null;
  const duration = Number(o.durationSec ?? o.duration ?? o.秒数);
  return {
    description: description || imagePrompt.slice(0, 80),
    subtitle: asString(o.subtitle ?? o.字幕),
    narration,
    durationSec:
      Number.isFinite(duration) && duration > 0 ? Math.min(30, duration) : 3,
    imagePrompt: imagePrompt || description,
    source: asSource(o.source ?? o.来源),
  };
}

function normalizePack(raw: unknown): CreationPack | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const shotsRaw = Array.isArray(o.shots)
    ? o.shots
    : Array.isArray(o.镜头)
      ? o.镜头
      : [];
  const shots = shotsRaw
    .map(normalizeShot)
    .filter((s): s is CreationPackShot => Boolean(s));
  const narration = asString(o.narration ?? o.口播稿 ?? o.口播 ?? o.body);
  const hook = asString(o.hook ?? o.开头钩子);
  if (!shots.length && !narration && !hook) return null;
  return {
    hook,
    narration:
      narration ||
      shots
        .map((s) => s.narration)
        .filter(Boolean)
        .join("\n"),
    styleNotes: asString(o.styleNotes ?? o.风格),
    musicMood: asString(o.musicMood ?? o.配乐),
    shots,
  };
}

/** Pull first fenced JSON object from text. */
function extractJsonObject(text: string): unknown | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    // trailing commas
    try {
      const cleaned = candidate
        .slice(start, end + 1)
        .replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

export function parseExtractResult(text: string): ParsedExtractResult {
  const raw = text.trim();
  if (!raw) {
    return { notes: "", pack: null, raw: "" };
  }

  const packMatch = raw.match(
    /##\s*创作包\s*([\s\S]*?)(?=\n##\s+|$)/i
  );
  const notesMatch = raw.match(
    /##\s*研究笔记\s*([\s\S]*?)(?=\n##\s*创作包|\n##\s+|$)/i
  );

  let notes = notesMatch?.[1]?.trim() || "";
  const packSection = packMatch?.[1]?.trim() || "";
  let pack = packSection ? normalizePack(extractJsonObject(packSection)) : null;

  if (!pack) {
    pack = normalizePack(extractJsonObject(raw));
  }

  if (!notes) {
    if (packMatch) {
      notes = raw.slice(0, packMatch.index).replace(/^##\s*研究笔记\s*/i, "").trim();
    } else if (pack) {
      notes = "";
    } else {
      notes = raw;
    }
  }

  return { notes, pack, raw };
}

export function sourceLabel(source: CreationPackShotSource): string {
  return source === "observed" ? "资料已见" : "推断补全";
}

export function formatNarrationForCopy(pack: CreationPack): string {
  if (pack.narration.trim()) return pack.narration.trim();
  return pack.shots
    .map((s, i) => {
      const line = s.narration || s.subtitle;
      return line ? `${i + 1}. ${line}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

export function formatShotPromptsForCopy(pack: CreationPack): string {
  return pack.shots
    .map((s, i) => {
      const bits = [
        `镜头 ${i + 1}（${sourceLabel(s.source)} · 约 ${s.durationSec}s）`,
        s.description ? `画面：${s.description}` : null,
        s.narration ? `旁白：${s.narration}` : null,
        s.subtitle ? `字幕：${s.subtitle}` : null,
        s.imagePrompt ? `Prompt：${s.imagePrompt}` : null,
      ].filter(Boolean);
      return bits.join("\n");
    })
    .join("\n\n");
}

export function formatStructureFromPack(pack: CreationPack): string {
  const lines = pack.shots.map((s, i) => {
    const tag = sourceLabel(s.source);
    return `${i + 1}. [${tag}] ${s.description || s.imagePrompt}${
      s.narration ? `｜旁白：${s.narration}` : ""
    }（约 ${s.durationSec}s）`;
  });
  const extras = [
    pack.styleNotes ? `风格：${pack.styleNotes}` : null,
    pack.musicMood ? `配乐：${pack.musicMood}` : null,
  ].filter(Boolean);
  return [...lines, ...extras].join("\n");
}

export function packToSeedContent(pack: CreationPack): Record<string, unknown> {
  return {
    title: "",
    hook: pack.hook,
    body: formatNarrationForCopy(pack),
    structure: formatStructureFromPack(pack),
    cta: "",
    hashtags: [] as string[],
    coverSuggestion: pack.shots[0]?.imagePrompt || "",
    [EXTRACT_SHOTS_KEY]: pack.shots,
  };
}

export const EXTRACT_KEYPOINTS_SYSTEM = `你是短视频创作顾问。根据资料写「研究笔记 + 创作包」，直接可进口播与生图/分镜 prompt。

硬性规则：
1. 用简体中文；像同事口头讲清楚，不要编号分类学清单（禁止「视觉风格 / 信息呈现 / 信息缺口」这类标题）。
2. 资料会标明「事实依据」或「视觉参考」。只有事实依据能支持做法、数据、功效、价格等事实断言；视觉参考只能影响镜头、构图、节奏、光线和拍摄/剪辑风格。
3. 没有事实依据时，不得把标题或视频封面补写成真实步骤、配方、数据或经验结论；可以产出“待核实”的内容主题和纯视觉分镜。
4. 资料里已能确认的画面/文案标 observed；需要创作性补全的镜头标 inferred，且不要伪装成资料事实。
5. 创作包至少 4–6 个镜头；每镜含画面描述、字幕、旁白、秒数、可直接喂模型的 imagePrompt。
6. 严格按下列格式输出（创作包必须是合法 JSON）：

## 研究笔记
（2–4 段连贯散文，写参考片在讲什么、可怎么拍、差异化怎么做。不要 bullet 分类表。）

## 创作包
\`\`\`json
{
  "hook": "开头钩子一句话",
  "narration": "完整口播稿，可按镜头换行",
  "styleNotes": "画面与剪辑风格短句",
  "musicMood": "配乐情绪短句",
  "shots": [
    {
      "description": "画面描述",
      "subtitle": "字幕",
      "narration": "本镜旁白",
      "durationSec": 3,
      "imagePrompt": "竖屏短视频画面英文或中文生图提示，含构图光影主体",
      "source": "observed"
    }
  ]
}
\`\`\`

资料可能含摘要+摘录压缩层，视为有效内容。可在创作包中合理补全镜头语言，但不要编造资料未支持的事实。`;
