# 6IX DEGREES — notes for Claude

Product spec: the "6IX DEGREES project context document" is authoritative. Key rules that must hold in code:

- Degrees of separation come ONLY from recorded connections via BFS in `src/lib/graph.ts`. Never infer edges from shared interests, employers, or locations. If no path exists, say so.
- Project 2 requirement: the app must work with NO AI service and NO secret keys. Ask 6ix, Memory and Discover are rule-based (`src/lib/assistant.ts`). Do not add API routes or AI SDKs.
- It must stay installable (`src/app/manifest.ts`, icons) and work offline (`public/sw.js`); bump `VERSION` in `sw.js` when its page list changes.
- Suggestions must be labeled, explainable, and dismissable. Never fabricate contact details or silently overwrite records.
- Design for phones first: no horizontal overflow, tap targets about 44px, inputs at 16px text.
- Demo data is fictional and always flagged `isDemo`. Never commit real contacts, phone numbers, addresses or private notes; test fixtures use made-up people and example.com addresses.
- Data stays on the device (localStorage). No cloud database, no sign-in.
- Published on GitHub Pages as a static export (`output: "export"`, `trailingSlash: true`). `.github/workflows/pages.yml` builds with `BASE_PATH=/<repo>`, so every URL must respect the base path: use `next/link`/`useRouter` (they add it), or `process.env.NEXT_PUBLIC_BASE_PATH` for anything else. No server features (API routes, middleware, dynamic routes without `generateStaticParams`).

Commands: `npm run dev`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` (static site in `out/`), `npm start` (serves `out/`). Check Pages paths with `BASE_PATH=/AI-Project-1 npm run build`.
Do not report a test as passed unless it was executed; update `docs/TESTING.md`.

@AGENTS.md
