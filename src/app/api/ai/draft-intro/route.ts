import { DRAFT_SYSTEM, DraftOutput, draftUserMessage } from "@/lib/ai/prompts";
import { errorResponse, structuredCall } from "@/lib/ai/client";
import { DraftIntroRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  // consentConfirmed must be literally true: the user has to approve first.
  const parsed = DraftIntroRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request, or consent not confirmed." }, { status: 400 });
  const { aId, bId, reason, network } = parsed.data;
  const a = network.contacts.find((c) => c.id === aId);
  const b = network.contacts.find((c) => c.id === bId);
  if (!a || !b) return Response.json({ error: "Contact not found." }, { status: 404 });

  try {
    const result = await structuredCall({
      system: DRAFT_SYSTEM,
      user: draftUserMessage(a, b, reason, network.profileName),
      schema: DraftOutput,
      effort: "low",
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
