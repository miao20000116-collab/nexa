import { redirect } from "next/navigation";

/** Session-scoped search URL. Current search uses query params; keep route reachable. */
export default async function SearchSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { sessionId } = await params;
  const sp = await searchParams;
  if (sp.q) {
    redirect(`/search?q=${encodeURIComponent(sp.q)}`);
  }
  redirect(`/search?sessionId=${encodeURIComponent(sessionId)}`);
}
