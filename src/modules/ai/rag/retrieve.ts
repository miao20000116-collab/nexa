/**
 * On-demand RAG for long workspace documents.
 * Only embeds/retrieves when content is long enough — not for every snippet.
 */

import { AIGateway } from "@/modules/ai/gateway/ai-gateway";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const LONG_DOC_CHARS = 4000;

export function needsRAG(text: string): boolean {
  return text.length >= LONG_DOC_CHARS;
}

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.trim().length > 0);
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Keyword fallback when embeddings unavailable */
function keywordRetrieve(query: string, chunks: string[], k: number) {
  const terms = query
    .toLowerCase()
    .split(/[\s,，。；;、]+/)
    .filter((t) => t.length > 1);
  return [...chunks]
    .map((c) => {
      const lower = c.toLowerCase();
      const score = terms.reduce(
        (s, t) => s + (lower.includes(t) ? 1 : 0),
        0
      );
      return { c, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c);
}

export async function retrieveForQuery(
  query: string,
  documents: Array<{ id: string; title?: string; text: string }>,
  k = 6
): Promise<string[]> {
  const longDocs = documents.filter((d) => needsRAG(d.text));
  if (longDocs.length === 0) {
    // Short docs: pass truncated originals, no embedding
    return documents
      .map((d) => `【${d.title || d.id}】\n${d.text.slice(0, 1500)}`)
      .slice(0, k);
  }

  const chunks: Array<{ docId: string; text: string }> = [];
  for (const doc of longDocs) {
    for (const c of chunkText(doc.text)) {
      chunks.push({ docId: doc.id, text: `【${doc.title || doc.id}】\n${c}` });
    }
  }

  if (!AIGateway.isAvailable("embed")) {
    return keywordRetrieve(
      query,
      chunks.map((c) => c.text),
      k
    );
  }

  try {
    const vectors = await AIGateway.embed([
      query,
      ...chunks.map((c) => c.text),
    ]);
    const q = vectors[0];
    if (!q) {
      return keywordRetrieve(
        query,
        chunks.map((c) => c.text),
        k
      );
    }
    return chunks
      .map((c, i) => ({
        text: c.text,
        score: cosine(q, vectors[i + 1] ?? []),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((x) => x.text);
  } catch {
    return keywordRetrieve(
      query,
      chunks.map((c) => c.text),
      k
    );
  }
}
