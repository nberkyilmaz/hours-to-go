# Architecture

## File map

```
hours-to-go/
├── index.html                  page shell, manifest and icon links, iOS home-screen meta tags
├── public/
│   ├── icon.svg                the app mark (source of truth for the PNGs)
│   ├── icon-192.png, icon-512.png, apple-touch-icon.png
│   └── manifest.webmanifest    name, colours, icons for "add to home screen"
├── src/                        the web app (also imported by the server: model and rules)
│   ├── main.tsx                mounts <App/>
│   ├── App.tsx                 tabs, banners, which entry form is open, suggestions for the form
│   ├── api.ts                  fetch wrapper; ApiError(status 0 = unreachable)
│   ├── useLogbook.ts           where the logbook lives (guest or profile), the save queue, sign in/out
│   ├── styles.css              all styles; tokens on :root, dark mode, phone rules at max-width 720px
│   ├── model/
│   │   ├── entry.ts            a logbook line: columns, Breakdown, derive(), validation, after-PPL part
│   │   ├── profile.ts          goals held, medical, milestones, training start dates, focus
│   │   └── store.ts            parsing (and converting old lines), merging, guest localStorage
│   ├── rules/
│   │   ├── goals.ts            the Standard 421 catalogue: every requirement with its paragraph
│   │   └── evaluate.ts         turns a logbook + profile into progress per goal
│   └── ui/
│       ├── Progress.tsx        goal detail, gates, requirement rows, milestone tick-offs, goal cards
│       ├── Logbook.tsx         totals tiles, column totals, by-type table, entry list/cards
│       ├── EntryForm.tsx       the flight / FTD / paper-totals form and its questions
│       ├── Profile.tsx         sign up / in, licences held, medical, export / import, delete
│       └── icons.tsx
├── server/
│   ├── main.ts                 reads env, creates the data folder, starts Fastify
│   ├── app.ts                  routes, session hook, static files, SPA fallback
│   ├── auth.ts                 scrypt hashing, session tokens, sign-in throttle
│   └── db.ts                   Store: every SQL statement in the project
├── test/
│   ├── web/                    jsdom: fixtures, entry, rules, app as guest, app signed in
│   └── server/                 node: the API through fastify.inject with an in-memory database
├── tsconfig.json               browser code: src, test/web (no Node types)
├── tsconfig.server.json        server, test/server, src/model, src/rules (Node types)
└── vite.config.ts              React plugin, /api proxy to :8787, Vitest settings
```

## Data model

### Logbook (`src/model/store.ts`)

```ts
{ version: 2, entries: Entry[], profile: Profile }
```

Version 1 files (one role per line) are still accepted and converted on read.

### Entry (`src/model/entry.ts`)

| Field | Meaning |
| --- | --- |
| `id` | random UUID |
| `forward` | true for totals copied from a paper logbook |
| `date` | `YYYY-MM-DD`; for paper totals, the last flight included |
| `aircraft`, `registration`, `from`, `to`, `remarks` | text |
| 10 flight-time columns | `seDayDual seDayPic seNightDual seNightPic meDayDual meDayPic meDayCopilot meNightDual meNightPic meNightCopilot`, minutes |
| 4 cross-country columns | `xcDayDual xcDayPic xcNightDual xcNightPic`, minutes, part of the time above |
| instrument | `actualImc hood ftd` minutes; `approaches` count |
| landings | `dayLandings nightLandings`, counts (one per takeoff and landing) |
| `solo` | flights: the PIC time was flown alone |
| `soloNightLandings` | how many night landings were solo, when the line mixes solo and other night time |
| `breakdown` | paper totals only, see below; `null` for flights and for totals saved before the questions existed |

`Breakdown` answers what the paper columns can't show:

| Field | Meaning |
| --- | --- |
| `solo` | `'all' \| 'none' \| 'some' \| null`: how much PIC was solo |
| `soloDay`, `soloNight`, `soloXc` | minutes, when `solo` is `'some'` |
| `afterPpl` | `'all' \| 'none' \| 'some' \| null`: how much was flown after the PPL |
| `after` | when `'some'`: `dual dualNight dualNightXc dualXc dualInst ftd solo soloNight` (minutes) and `soloNightLandings` (count) |

`derive(entry)` (cached per object in a WeakMap; entries are never mutated after creation) gives
what a line contributes: `dual dualNight pic picNight copilot copilotNight total night multi solo
soloNight soloXc soloNightLandings xcDual xcPic xcNightDual xcNightPic inst dualInst ftd`. Every
requirement reads from these, never from raw columns.

`afterPplPart(entry, pplDate)` returns the part of a line flown after the PPL: the whole flight
(or `null` if dated before), or for paper totals a synthetic line built from the `after` answers.

### Profile (`src/model/profile.ts`)

| Field | Meaning |
| --- | --- |
| `medical` | `none cat4 cat3 cat1` |
| `held` | goal id → `{ date }` (date may be blank) |
| `milestones` | key → `{ date, score? }` (exams, ground school, special flights, flight tests) |
| `trainingStart` | goal id → date, overriding where a goal's training window starts |
| `focus` | the goal shown first on Progress |

Goal ids: `ppl night vfrott cpl multi ifr3 ifr1 inst4 atpl`.

## Rules (`src/rules/`)

`goals.ts` defines each goal as sections (prerequisites, knowledge, experience, skill) of
requirements, plus gates (write the exam, take the flight test). Requirement kinds:

| Kind | Met when |
| --- | --- |
| `time` | `have(ctx)` minutes ≥ `need` hours × 60 |
| `count` | `have(ctx)` ≥ `need` |
| `milestone` | ticked off, and the mark (if entered) ≥ `minScore` |
| `held` | any of the listed goals is held |
| `medical` | profile medical is one of the listed categories |
| `info` | always; shows a figure (multi-engine time) |

Any requirement may have `credit(ctx)` (met by something held, with the reason shown), `hint(ctx)`
(shown while unmet, e.g. PIC time not counted as solo), `note`, and nested `sub` requirements
("…including…").

`ctx` has `all` (every entry), `scoped` (the goal's training window), `profile` and `today`
(for letters that expire after 60 days). Sections marked `scoped` read `ctx.scoped`; the evaluator
gives every other section `scoped = all`. Milestones may have `maxAgeDays` (a recommendation
letter): older than that, they stop counting and the row says so.

**Written exams.** `EXAM_CHECKS` maps each exam milestone (`exam-ppaer`, `exam-cpaer`, `exam-inrat`,
`exam-samra`, `exam-saron`, `exam-airaf`) to its 421.13 conditions. Wherever that milestone appears,
its result carries `exam: { name, ready, passed, checks }`, judged on the goal's own context so a
scoped condition (the AIRAF's instructor training) uses the training window. The "Write the …"
gates use the same conditions and add `passed` once their exams are passed.

`evaluate.ts`:

1. Works out the window: CPL from the PPL issue date (or the "Count training from" override); Class 4
   from the course start the pilot sets. No PPL held means an empty CPL window and a message.
2. Builds the window's entries. For CPL each line goes through `afterPplPart`; unanswered paper
   totals count in full and add a message.
3. Evaluates each requirement and its children (and, for a written exam, its conditions); gates
   either list their own requirements or take "every knowledge and experience requirement".
4. Returns done/total counts, the largest time shortfall (`minutesToGo`), whether everything is met,
   and the held or credited state.

## API (`server/app.ts`)

All JSON. Errors are `{ "error": "message for the pilot" }`. The session cookie is `htg_session`.

| Method and path | Body | Notes |
| --- | --- | --- |
| `POST /api/auth/signup` | `{ email, password }` | 400 bad email or password under 8 characters, 409 email taken; sets the cookie |
| `POST /api/auth/login` | `{ email, password }` | 401 wrong, 429 after 10 failures in 15 minutes per IP and email |
| `POST /api/auth/logout` | | deletes the session row, clears the cookie, 204 |
| `GET /api/me` | | `{ user: { email } }` or 401 |
| `DELETE /api/account` | `{ password }` | deletes the user; entries, profile and sessions cascade; 204 |
| `GET /api/logbook` | | `{ version: 2, entries, profile }` |
| `PUT /api/entries/:id` | an entry | parsed and validated with the same code as the browser; id must match |
| `DELETE /api/entries/:id` | | 204, only the caller's own entry |
| `PUT /api/profile` | a profile | replaces it |
| `POST /api/logbook/merge` | a logbook | adds what is missing, never overwrites; returns the result |

Any other `/api/*` is 404. Any other GET serves `index.html` (when `dist/` exists), so client-side
tabs survive a reload.

## Database (`server/db.ts`)

```sql
users    (id text pk, email text unique, password_hash text, created_at text)
sessions (token_hash text pk, user_id → users on delete cascade, expires_at integer)
entries  (user_id → users on delete cascade, id text, data text /* JSON */, pk (user_id, id))
profiles (user_id pk → users on delete cascade, data text /* JSON */)
```

WAL mode, foreign keys on. Entry and profile JSON is passed through the same parsers as files, so
old formats are converted when read. Expired sessions are swept whenever a new one is created.

## Client state (`src/useLogbook.ts`)

- On load: `GET /api/me`. 200 means profile mode (load `/api/logbook`); 401 means guest; anything
  else means guest with an "offline" banner.
- `book` is what the screens show. `guest` is what is saved in this browser; while signed in, any
  guest entries trigger the "add them to your profile" banner.
- Every change goes through `change(apply, save)`: apply locally at once, then (signed in) queue the
  server call. Failures set the error banner and reload the server copy.
- `signUp` merges the device's guest log into the new profile and clears it from the browser.

## Screens

- **Progress**: "Working on" picker; the goal's name, citation link, "Mark … as held" or held date;
  "You hold: …"; least flying left and requirements met; unlock cards ("You can write it", "Passed");
  the training-window box for CPL and Class 4; every requirement with a bar, figures, notes, credits
  and hints; milestones are ticked from the status circle and take a date and mark; under each written
  exam, a "Can you write the … yet?" checklist with the photo-ID reminder. Below, a card per goal.
- **Logbook**: Log a flight, Log FTD session, Add totals from your paper logbook; totals tiles;
  "Every column, laid out like your paper logbook"; "By aircraft type"; the entry list. Entries open
  the form in the layout they were made with.
- **Profile**: create profile / sign in (or signed-in status, sign out, delete with password);
  licences and ratings held with issue dates; medical; export, import (merge), erase this device's
  guest log; the "not an official record" notice with the link to Standard 421.

## Phone and home screen

The manifest and icons let the app be added to a home screen (standalone display). There is no
service worker, so it needs a connection to load; a signed-out device keeps working from
localStorage once loaded.
