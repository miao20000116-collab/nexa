import { cleanQuery } from "@/modules/search/services/query-rewriter";

export function generateWorkspaceName(query?: string): string {
  if (!query?.trim()) return "未命名工作区";

  const cleaned = cleanQuery(query).replace(/[？?！!。，,；;：:]+$/g, "");
  if (!cleaned) return "未命名工作区";

  if (cleaned.length <= 16) {
    return cleaned.includes("研究") ? cleaned : `${cleaned}研究`;
  }

  const short = cleaned.slice(0, 14);
  return `${short}…研究`;
}
