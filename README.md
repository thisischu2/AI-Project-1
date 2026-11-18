# 6IX DEGREES

**Everyone is closer than you think.**

6IX DEGREES is an AI-powered personal relationship intelligence app. It helps you remember the people you meet, see how your network connects, and discover introductions that might help, all grounded in what you actually recorded.

> Class project for AI & Legal Reasoning. Built with Next.js, TypeScript, Tailwind CSS, Cytoscape.js and the Claude API.

## What works in this version (v0.1)

| Module | What you can do | Powered by |
| --- | --- | --- |
| **Onboarding** | Start an empty network or explore a clearly labeled fictional demo | — |
| **Home** | Network stats, map preview, follow-ups and upcoming dates, recent contacts and memories, possible introductions, Ask 6ix bar | Deterministic code |
| **My Circle** | Add, edit, search, filter and delete contacts; multiple categories; important dates; timeline; follow-ups; record who knows whom | Deterministic code |
| **The Map** | Interactive network map (zoom, pan, select), category filters, shortest known path with highlighting, "no recorded path" handling | Breadth-first search (no AI) |
| **Memory** | Write a note, Claude proposes structured fields, you review every field before anything is saved | Claude |
| **Discover** | Possible introductions with the recorded evidence for each, plus a consent-gated introduction draft you send yourself | Code finds the evidence, Claude explains it |
| **Ask 6ix** | Ask about your own network; path questions show the verified path from the map | Code retrieves records and paths, Claude answers |

Data is stored in your browser (localStorage) in this version. The Supabase schema for real accounts is already written in [`supabase/migrations`](supabase/migrations) (see the roadmap below).

## Run it on your computer

You need **Node.js 20 or newer** ([download](https://nodejs.org)) and **git**.

```bash
# 1. Get the code
git clone https://github.com/thisischu2/AI-Project-1.git
cd AI-Project-1

# 2. Install the libraries the app uses (takes a minute)
npm install

# 3. Add your Claude API key
cp .env.example .env.local
#    then open .env.local and paste your key after ANTHROPIC_API_KEY=
#    (create a key at https://console.anthropic.com/settings/keys)

# 4. Start the app
npm run dev
```

Open http://localhost:3000. Click **Explore demo network**, then try **The Map → You → James Whitfield** to see "3 degrees of separation".

Without an API key everything except Memory, Discover and Ask 6ix still works; those show a clear "Claude is not configured" message.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app with live reload |
| `npm test` | Run the automated tests (graph, retrieval, reminders) |
| `npm run lint` | Check code style |
| `npm run typecheck` | Check TypeScript types |
| `npm run build` | Make a production build (what Vercel runs) |

## How it is built

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a plain-language tour, and [docs/TESTING.md](docs/TESTING.md) for the test log.

The key design rule: **facts are computed by code, judgment comes from Claude.** Degrees of separation, counts, dates, filters and the evidence behind suggestions are deterministic. Claude only does note extraction, explanations, answers and drafts, and only sees the records relevant to each request.

## Roadmap

- **Phase 2 — Accounts and cloud storage:** Supabase Auth + Postgres using the included migration, replacing `src/lib/store.tsx`.
- **Phase 3 — Deploy:** Vercel, with `ANTHROPIC_API_KEY` set as a server-side environment variable.
- **Phase 4 — Polish:** follow-up suggestions, editing AI suggestions history, more evaluation scenarios.
- Deferred until after MVP: voice, email/calendar sync, notifications, social integrations, shared graphs, native mobile apps.
