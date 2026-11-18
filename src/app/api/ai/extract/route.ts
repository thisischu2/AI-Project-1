import { EXTRACT_SYSTEM, ExtractOutput, extractUserMessage } from "@/lib/ai/prompts";
import { errorResponse, structuredCall } from "@/lib/ai/client";
import { ExtractRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = ExtractRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { note, today, contactId, network } = parsed.data;
  const focus = contactId ? network.contacts.find((c) => c.id === contactId) : undefined;

  try {
    const result = await structuredCall({
      system: EXTRACT_SYSTEM,
      user: extractUserMessage(note, today, network, focus),
      schema: ExtractOutput,
      effort: "medium",
    });
    // Guard against a match to an id that doesn't exist.
    if (result.matchedContactId && !network.contacts.some((c) => c.id === result.matchedContactId)) {
      result.matchedContactId = null;
      result.isNewContact = true;
    }
    if (focus && !result.matchedContactId) {
      result.matchedContactId = focus.id;
      result.isNewContact = false;
    }
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
