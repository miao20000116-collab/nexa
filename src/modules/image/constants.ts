import type { ImagePurpose } from "@/modules/image/types";

export const IMAGE_PURPOSE_OPTIONS: {
  id: ImagePurpose;
  label: string;
  hint: string;
}[] = [
  {
    id: "product_scene",
    label: "商品场景图",
    hint: "把商品放进真实使用场景",
  },
  {
    id: "social_cover",
    label: "社交媒体封面",
    hint: "适合小红书 / Instagram 等封面比例",
  },
  {
    id: "ecommerce_main",
    label: "电商主图辅助",
    hint: "干净主图风格，突出卖点",
  },
  {
    id: "content_illustration",
    label: "内容配图",
    hint: "文章 / 帖子插图",
  },
];

export const PURPOSE_PROMPT_PREFIX: Record<ImagePurpose, string> = {
  product_scene:
    "生成一张商品场景图：保留参考商品外观与品牌特征，放入自然真实场景。",
  social_cover:
    "生成一张社交媒体封面图：构图清晰、视觉冲击强，适合信息流封面。",
  ecommerce_main:
    "生成一张电商主图辅助素材：背景干净、主体突出、适合商品详情页。",
  content_illustration:
    "生成一张内容配图：风格统一、信息明确，适合图文内容。",
};

/** Prefer assets that look like product / person / scene / logo. */
export function rankAssetForImageRef(meta: {
  subject?: string | null;
  scene?: string | null;
  visual_tags?: string[];
  usage_suggestion?: string | null;
  fileName?: string;
}): number {
  const blob = [
    meta.subject,
    meta.scene,
    meta.usage_suggestion,
    meta.fileName,
    ...(meta.visual_tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;
  if (/商品|product|sku|blender|fountain|包装|packaging/.test(blob)) score += 40;
  if (/人物|人像|模特|person|portrait|face/.test(blob)) score += 30;
  if (/场景|scene|公园|厨房|airport|travel|picnic/.test(blob)) score += 25;
  if (/logo|标志|品牌|brand/.test(blob)) score += 35;
  if (/封面|cover|主图|hero/.test(blob)) score += 10;
  return score;
}
