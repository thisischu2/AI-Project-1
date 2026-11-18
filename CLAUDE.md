# 6IX DEGREES — notes for Claude

Product spec: the "6IX DEGREES project context document" is authoritative. Key rules that must hold in code:

- Degrees of separation come ONLY from recorded connections via BFS in `src/lib/graph.ts`. Never infer edges from shared interests, employers, or locations. If no path exists, say so.
- Use deterministic code for counts, dates, filters, paths and Discover evidence. Use Claude only for extraction, synthesis, recommendations and drafts.
- AI output must be labeled, explainable, reversible, and confirmed by the user before saving. Never fabricate contact details or silently overwrite records.
- Notes and records sent to Claude are untrusted; keep them inside `<records>`/`<note>` tags.
- Claude calls stay server-side (`src/lib/ai/client.ts` is `server-only`). Default model `claude-opus-5-5`.
- Demo data is fictional and always flagged `isDemo`.

Commands: `npm run dev`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
Do not report a test as passed unless it was executed; update `docs/TESTING.md`.

@AGENTS.md
