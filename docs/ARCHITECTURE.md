# How 6IX DEGREES is built

```
Phone browser (or home-screen app)
┌──────────────────────────────────────────────┐
│ Pages: Home, Circle, Map, Memory, Discover,  │
│ Ask 6ix                                      │
│   │                                          │
│   ├─ plain-code logic (src/lib)              │
│   │    graph search, keyword search, Discover│
│   │    evidence, reminders                   │
│   └─ local storage (your saved network)      │
│ Offline helper (public/sw.js) caches pages   │
└──────────────────────────────────────────────┘
No server code, no AI service, no secret keys.
```

- **Next.js** builds every page as a static file. There are no API routes, so the app can be hosted anywhere that serves files.
- **Everything happens on the device.** Data stays in the browser's local storage; nothing is sent to any service.
- **Installable.** `src/app/manifest.ts` and the icons let phones add it to the home screen; `public/sw.js` lets it open offline.

## Where things live

| Path | Purpose |
| --- | --- |
| `src/lib/types.ts` | The data model: contacts, connections, interactions, reminders |
| `src/lib/graph.ts` | Breadth-first search for shortest paths and degrees of separation |
| `src/lib/layout.ts` | Radial map layout: rings are degrees from you |
| `src/lib/retrieval.ts` | Finds who a question is about, verified paths, and Discover evidence |
| `src/lib/assistant.ts` | Ask 6ix answers, Discover wording, and intro templates, all rule-based |
| `src/lib/reconnect.ts` | Upcoming follow-ups and dates (birthdays repeat yearly) |
| `src/lib/validation.ts` | The shape of a saved network, with defaults for older data |
| `src/lib/persistence.ts` | Checks saved data on load (repairs, never silently discards), backup files, combining two networks |
| `src/lib/duplicates.ts` | Duplicate rules (email, phone, names, nicknames) with reasons, and merging two contacts |
| `src/lib/importers.ts` | CSV and vCard parsing, column matching, row classification and the import plan |
| `src/lib/opportunities.ts` | Opportunity Engine: ranks people for each saved goal by recorded evidence (job, skills, interests, their goals, tags, your notes) times map distance, with a reason list; ignores words most of the circle shares when they are the only match; never suggests someone for location alone; drafts a direct ask or an introduction request to the person in between |
| `src/lib/actions.ts` | Ask 6ix actions: recognises "remind me to…", "draft a message to…", "write an intro for…" and "open…", builds check-in drafts from saved facts (listing which ones), and offers open/draft/follow-up after answers about one person. Changes no data itself |
| `src/lib/capture.ts` | Contact capture: reads a typed description and fills name, job, workplace, city, email, phone, how you met, interests, goals, skills, relationship and a dated birthday, each with the words it came from. Matches "introduced by …" only to people already saved |
| `src/lib/memory.ts` | Note search, promise and follow-up spotting from a note's wording (with due dates from "by Friday", "next week" and so on), and the per-person "At a glance" summary where every line names its source notes |
| `src/app/data/page.tsx` | Backup & your data: save, load (combine or replace), recovered copy, delete all |
| `src/app/manifest.ts`, `public/sw.js` | Home-screen install and offline support |
| `src/lib/demo-data.ts` | Fictional demo network (every person flagged `isDemo`) |
| `src/components/` | Shared UI: app shell, map, profile, forms, primitives |
| `supabase/migrations/` | Phase 2 database schema with Row Level Security |

## Safeguards

- Degrees of separation come only from connections you recorded. Shared interests, employers, or cities never create a connection.
- Ask 6ix only reports what is stored, and lists what is missing ("Not in your records").
- Discover labels each idea as a possibility, shows the recorded evidence, and never uses location alone.
- Introduction drafts require a consent checkbox, list which details they share, and are never sent by the app.
- Demo people are fictional and labeled.

## Moving to Supabase (Phase 2)

1. Create a Supabase project and run `supabase/migrations/0001_initial_schema.sql`.
2. Add the Supabase project URL and public key to `.env.local`. (This would bring back keys and a network connection, so it is out of scope for Project 2.)
3. Add sign-in pages with Supabase Auth.
4. Replace the localStorage calls in `src/lib/store.tsx` with Supabase queries.
