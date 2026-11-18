import { ASK_SYSTEM, AskOutput, askUserMessage } from "@/lib/ai/prompts";
import { errorResponse, structuredCall } from "@/lib/ai/client";
import { selectForAsk } from "@/lib/retrieval";
import { AskRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = AskRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { question, network } = parsed.data;

  try {
    const ctx = selectForAsk(question, network);
    const result = await structuredCall({
      system: ASK_SYSTEM,
      user: askUserMessage(question, ctx, network),
      schema: AskOutput,
      effort: "medium",
    });
    const known = new Set(network.contacts.map((c) => c.id));
    return Response.json({
      ...result,
      referencedContactIds: result.referencedContactIds.filter((id) => known.has(id)),
      // The path shown in the UI always comes from the deterministic BFS, never from the model.
      paths: ctx.pathFacts,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
