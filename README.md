# 6IX DEGREES

**Everyone is closer than you think.**

6IX DEGREES is a phone-friendly personal network app. It helps you remember the people you meet, see how your network connects, and spot introductions that might help, all grounded in what you actually recorded.

> Class project (Project 2). Built with Next.js, TypeScript, Tailwind CSS and Cytoscape.js. **No AI service and no secret keys**: everything runs on your phone.

## What it does

| Tab | What you can do | How it works |
| --- | --- | --- |
| **Home** | Network stats, map preview, follow-ups and upcoming dates, recent contacts and memories, possible introductions, a search bar | Plain code |
| **My Circle** | Add, edit, search, filter and delete contacts; multiple categories; important dates; timeline; follow-ups; record who knows whom | Plain code |
| **The Map** | Interactive map (pinch, drag, tap), category filters, shortest known path with highlighting, "no recorded path" handling | Breadth-first search |
| **Memory** | Jot down a conversation: who, how, when, and an optional follow-up. If your note names a saved person, they're picked for you | Plain code (name matching) |
| **Discover** | Possible introductions with the recorded evidence for each, plus a consent-gated introduction template you send yourself | Keyword matching on recorded interests, goals and skills |
| **Ask 6ix** | Ask about your own network: paths ("How am I connected to James?"), people ("What did I last discuss with Marcus?"), places ("Who do I know in Toronto?") or topics | Rule-based search over your records |

## Phone app features (Project 2 checklist)

- **Installs on the home screen and opens in its own window.** `src/app/manifest.ts` (name, icons, `display: "standalone"`) plus `src/app/apple-icon.png` for iPhone.
- **Saves data between uses.** Your network is stored in the browser's local storage (`src/lib/store.tsx`).
- **Works with no internet connection.** `public/sw.js` keeps a copy of every page; your data is already on the phone.
- **Calculates results from your inputs.** Degrees of separation, reminder countdowns, and Discover matches.
- **Backup and move between devices.** The Backup page (top-right on a phone) saves one file you can AirDrop, email or save to Drive, and loads it on another device: combine with what's there, or replace it. A new device can load a backup straight from the welcome screen.
- **Import and tidy up contacts.** My Circle → Import reads CSV (Google, Outlook, LinkedIn, spreadsheets) and vCard (.vcf) files on the device, lets you fix the column matching, and shows every row as new, possible duplicate or skipped before saving. Possible duplicates in your circle are flagged with the reason and can be merged.
- **No AI service and no keys.** There is no server code and nothing to configure.

### Install it on your phone

1. Open the app's web address on your phone.
2. **iPhone (Safari):** tap Share, then **Add to Home Screen**. **Android (Chrome):** tap the ⋮ menu, then **Install app** (or **Add to Home screen**).
3. Open **6IX** from your home screen. It opens full screen, without the browser bar, and works in airplane mode after the first visit.

## Run it on your computer

You need **Node.js 20 or newer** ([download](https://nodejs.org)) and **git**.

```bash
git clone https://github.com/thisischu2/AI-Project-1.git
cd AI-Project-1
npm install
npm run dev
```

Open http://localhost:3000. Click **Explore demo network**, then try **The Map → You → James Whitfield** to see "3 degrees of separation".

Offline support only switches on in the production build: run `npm run build && npm start` to try it.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app with live reload |
| `npm test` | Run the automated tests (graph, search, Discover, reminders) |
| `npm run lint` | Check code style |
| `npm run typecheck` | Check TypeScript types |
| `npm run build` | Make a production build (what Vercel runs) |

## How it is built

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a plain-language tour, and [docs/TESTING.md](docs/TESTING.md) for the test log.

The key design rule: **facts are computed by code from what you recorded.** Degrees of separation, counts, dates, filters, search answers and the evidence behind suggestions are all deterministic. If something isn't recorded, the app says so instead of guessing.

## Roadmap

- **Phase 2 — Accounts and cloud storage:** Supabase Auth + Postgres using the included migration, replacing `src/lib/store.tsx`.
- **Phase 3 — Deploy:** Vercel (no environment variables needed).
- **Phase 4 — Polish:** follow-up suggestions, smarter search wording (synonyms), more evaluation scenarios.
- Deferred until after MVP: voice, email/calendar sync, notifications, social integrations, shared graphs, native mobile apps.
