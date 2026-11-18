import { DISCOVER_SYSTEM, DiscoverOutput, discoverUserMessage } from "@/lib/ai/prompts";
import { errorResponse, structuredCall } from "@/lib/ai/client";
import { discoverCandidates } from "@/lib/retrieval";
import { DiscoverRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = DiscoverRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { network } = parsed.data;

  const candidates = discoverCandidates(network);
  if (candidates.length === 0) return Response.json({ suggestions: [] });

  try {
    const result = await structuredCall({
      system: DISCOVER_SYSTEM,
      user: discoverUserMessage(candidates, network),
      schema: DiscoverOutput,
      effort: "low",
    });
    // Keep only suggestions that match a candidate the app found, and attach
    // the app's own evidence (not the model's wording of it).
    const key = (a: string, b: string) => [a, b].sort().join("|");
    const byKey = new Map(candidates.map((c) => [key(c.aId, c.bId), c]));
    const suggestions = result.suggestions
      .filter((s) => byKey.has(key(s.aId, s.bId)))
      .map((s) => ({ ...s, evidence: byKey.get(key(s.aId, s.bId))!.evidence }));
    return Response.json({ suggestions });
  } catch (error) {
    return errorResponse(error);
  }
}
