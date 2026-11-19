# Test log

Tests use fictional contacts only. "Pass" is recorded only for tests that were actually executed.

**How to run:** `npm test` (unit tests) · `psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql` (database isolation, needs local PostgreSQL)

| # | Scenario | Input | Expected | Observed | Result | Limitation / revision |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Shortest-path correctness | Demo graph, You → James | You → Marcus → Danielle → James, 3 degrees | Same (unit test + browser) | Pass | — |
| 2 | No-path handling | Contact with no recorded connections | "No recorded path", no guess | Same (unit test + browser) | Pass | — |
| 3 | Tie-breaking is deterministic | Two equal-length paths | Same path every run | Same | Pass | Picks alphabetical by id, not "best" path |
| 4 | No edges from shared attributes | Two people, same city, no edge | No path; no Discover suggestion from location alone | Same | Pass | — |
| 5 | Recommendation evidence | Demo network | Every suggestion carries recorded evidence; never suggests already-connected pairs | Same (unit test) | Pass | Keyword matching is simple (no synonyms) |
| 6 | Cross-user access prevention | User B queries/edits user A's rows | Zero rows visible; writes rejected | All 4 checks passed on PostgreSQL 16 | Pass | Tested with a stand-in for Supabase auth, not a live Supabase project |
| 7 | CRUD persistence | Add contact, reload page | Contact still there | Same (browser) | Pass | Browser storage only in v1 |
| 8 | Mobile usability | 390×844 viewport | Bottom nav, readable layout | Checked by screenshot | Pass | Manual check only |
| 9 | Ask 6ix answers from records only | "Who do I know in New York?", "What did I last discuss with Marcus?" | Only recorded people/notes; latest note quoted | Same (unit test + phone browser) | Pass | Simple keyword rules, no synonyms |
| 10 | Missing-data acknowledgment | "Who do I know in Paris?", nonsense words | Says nothing is recorded; gap listed | Same (unit test) | Pass | — |
| 11 | Memory saves a note | "Quick call with Priya…" on a phone | Priya picked from the note; saved to her timeline | Same (phone browser) | Pass | Name matching only; you confirm the person |
| 12 | Intro draft has no contact details | Draft for a contact with an email | Email not in the draft; shared details listed | Same (unit test + phone browser) | Pass | Template wording, not personalized |
| 13 | No outside requests, no keys | Full walk-through on an emulated Pixel 7 | Zero requests to other sites; no API routes in the build | Same (Playwright) | Pass | — |
| 14 | Installable | Production build | Manifest with name, icons, `standalone`; iPhone icon linked; offline helper active | Same (Playwright + curl) | Pass | Not yet tried on a real phone's home screen |
| 15 | Works offline | Load app once, switch to offline, open Home, Circle, Map, Ask, Memory | Every page opens; saved data still there | Same (Playwright) | Pass | Pages never opened while online fall back to Home |
| 16 | Fits a phone screen | Every tab at 412px wide | No sideways scrolling | Same (Playwright) | Pass | Fixed overflow on Home and My Circle |
| 17 | Damaged saved data is kept | Saved data cut off mid-file, then reload | Original copied aside, warning shown, recovered copy downloadable from Backup | Same (unit test + Playwright) | Pass | One recovery slot; a second failure replaces the first copy |
| 18 | Partly damaged data is repaired | Contacts missing fields, links to missing people, unknown categories | Fields filled in, broken links dropped and counted, nothing crashes | Same (unit tests) | Pass | — |
| 19 | Phone to computer | Save backup on an emulated phone, load it from the welcome screen on a fresh desktop browser | Same people, notes and follow-ups | Same (Playwright) | Pass | File travels by the person's own means (AirDrop, email, Drive) |
| 20 | Computer to phone, combine | Add a person on the computer, back up, combine on the phone | Person added; phone's own notes kept; nothing duplicated | Same (unit tests + Playwright) | Pass | Combine never deletes, so deletions on one device don't carry over; use Replace for an exact copy |
| 21 | Replace needs confirmation | Load a backup, choose Replace | Confirmation listing what will be removed, then exact copy | Same (Playwright) | Pass | — |
| 22 | Wrong or hostile files | Empty file, plain text, another app's JSON, newer format, file over 20 MB | Clear message, nothing changed | Same (unit tests + Playwright) | Pass | — |
| 23 | Delete all my data | Type DELETE, confirm | Back to the welcome screen, saved data and recovery copy removed | Same (Playwright) | Pass | Backups saved elsewhere are untouched |
| 24 | Backup page offline | Open Backup with no connection | Page loads | Same (Playwright) | Pass | Sharing a file still needs a way to send it |
