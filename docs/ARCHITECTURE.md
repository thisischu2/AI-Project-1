# Architecture (plain-language tour)

## The big picture

```
Browser (React pages)                         Server (Next.js route handlers)            Claude API
┌────────────────────────────┐   JSON    ┌──────────────────────────────────┐  HTTPS  ┌────────────┐
│ Home, Circle, Map, Memory, │ ───────▶  │ /api/ai/ask, extract, discover,  │ ──────▶ │ claude-    │
│ Discover, Ask 6ix          │ ◀───────  │ draft-intro                      │ ◀────── │ opus-5-5   │
│                            │           │  1. validate input (zod)         │         └────────────┘
│ store.tsx  ── localStorage │           │  2. pick relevant records (code) │
│ graph.ts   ── BFS paths    │           │  3. compute facts (code)         │
└────────────────────────────┘           │  4. ask Claude, validate output  │
                                         └──────────────────────────────────┘
```

- **Next.js** gives us both the pages and a small server in one project. Pages live in `src/app/<name>/page.tsx`; server endpoints live in `src/app/api/.../route.ts`.
- **The API key stays on the server.** Only route handlers import `src/lib/ai/client.ts`, which is marked `server-only` so it can never be bundled into the browser.
- **Storage (v1)** is the browser's localStorage, wrapped in one React provider (`src/lib/store.tsx`). Every page reads and writes through it, so moving to Supabase means rewriting that one file.

## Where things live

| Path | Purpose |
| --- | --- |
| `src/lib/types.ts` | The data model: contacts, connections, interactions, reminders |
| `src/lib/graph.ts` | Breadth-first search for shortest paths and degrees of separation |
| `src/lib/layout.ts` | Radial map layout: rings are degrees from you |
| `src/lib/retrieval.ts` | Chooses which records Claude sees; finds Discover evidence |
| `src/lib/reconnect.ts` | Upcoming follow-ups and dates (birthdays repeat yearly) |
| `src/lib/validation.ts` | Schemas that reject malformed or oversized requests |
| `src/lib/ai/client.ts` | Claude client, shared safety rules, error handling |
| `src/lib/ai/prompts.ts` | System prompts and output schemas for each AI feature |
| `src/lib/demo-data.ts` | Fictional demo network (every person flagged `isDemo`) |
| `src/components/` | Shared UI: app shell, map, profile, forms, primitives |
| `supabase/migrations/` | Phase 2 database schema with Row Level Security |

## Deterministic vs. Claude-powered

| Feature | Deterministic code | Claude |
| --- | --- | --- |
| Degrees of separation | BFS over recorded connections only | Never computes paths; explains the verified one |
| Ask 6ix | Finds named people, computes paths, filters relevant records | Writes the answer, lists gaps |
| Memory | Shows a diff; changing an existing value is unchecked by default | Proposes fields from the note |
| Discover | Finds unconnected pairs with shared interests or goal↔skill matches; location alone never counts | Writes a tentative headline and rationale; app attaches its own evidence |
| Intro drafts | Requires an explicit consent checkbox (`consentConfirmed: true`) | Drafts text and lists every detail it shares; never sends |

## AI safeguards

- Every request sends only relevant records (max 40 contacts for Ask 6ix).
- Notes and records are wrapped in `<records>` / `<note>` tags and the system prompt says text inside them is data, not instructions (prompt-injection resistance).
- Responses are forced into a JSON schema (structured outputs) and validated; ids the model returns are checked against real records.
- Suggestions are labeled "AI suggestion" / "Possibility", show evidence, and can be dismissed. Nothing is saved without the user approving it.
- Model: `claude-opus-5-5` with server-side refusal fallbacks enabled. Override with `ANTHROPIC_MODEL` in `.env.local`.

## Moving to Supabase (Phase 2)

1. Create a Supabase project and run `supabase/migrations/0001_initial_schema.sql`.
2. Add the Supabase keys to `.env.local` (see `.env.example`).
3. Add sign-in pages with Supabase Auth.
4. Replace the localStorage calls in `src/lib/store.tsx` with Supabase queries. The AI routes then load records on the server instead of receiving them from the browser.
