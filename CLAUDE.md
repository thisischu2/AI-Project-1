# 6IX DEGREES — notes for Claude

Product spec: the "6IX DEGREES project context document" is authoritative. Key rules that must hold in code:

- Degrees of separation come ONLY from recorded connections via BFS in `src/lib/graph.ts`. Never infer edges from shared interests, employers, or locations. If no path exists, say so.
- Project 2 requirement: the app must work with NO AI service and NO secret keys. Ask 6ix, Memory and Discover are rule-based (`src/lib/assistant.ts`). Do not add API routes or AI SDKs.
- It must stay installable (`src/app/manifest.ts`, icons) and work offline (`public/sw.js`); bump `VERSION` in `sw.js` when its page list changes.
- Suggestions must be labeled, explainable, and dismissable. Never fabricate contact details or silently overwrite records.
- Design for phones first: no horizontal overflow, tap targets about 44px, inputs at 16px text.
- Demo data is fictional and always flagged `isDemo`.

Commands: `npm run dev`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
Do not report a test as passed unless it was executed; update `docs/TESTING.md`.

@AGENTS.md
