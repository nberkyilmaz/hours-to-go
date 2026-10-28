# Architecture

## File map

```
hours-to-go/
├── .github/workflows/
│   ├── ci.yml                  typecheck, tests (PGlite and a Postgres server), page build, API image
│   └── pages.yml               publishes the page to GitHub Pages under /hours-to-go/
├── Dockerfile                  the API image Render runs (no page in it)
├── render.yaml                 Render blueprint: free web service, health check, env vars
├── index.html                  page shell, manifest and icon links, iOS home-screen meta tags
├── public/
│   ├── icon.svg                the app mark (source of truth for the PNGs)
│   ├── icon-192.png, icon-512.png, apple-touch-icon.png
│   └── manifest.webmanifest    name, colours, icons for "add to home screen"; paths relative to it
├── src/                        the web app (also imported by the server: model and rules)
│   ├── main.tsx                mounts <App/>
│   ├── App.tsx                 welcome or app, masthead and tabs, banners, which entry form is open
│   ├── api.ts                  fetch wrapper; VITE_API prefix; ApiError(status 0 = unreachable)
│   ├── vite-env.d.ts           types for import.meta.env
│   ├── useLogbook.ts           where the logbook lives (guest or profile), the save queue, sign in/out
│   ├── styles.css              all styles; tokens on :root (the glass-cockpit look, D21), dark mode,
│   │                           phone rules at max-width 720px
│   ├── model/
│   │   ├── entry.ts            a logbook line: columns, Breakdown, derive(), validation, after-PPL part
│   │   ├── profile.ts          goals held, medical, milestones, training start dates, focus
│   │   └── store.ts            parsing (and converting old lines), merging, guest localStorage
│   ├── rules/
│   │   ├── goals.ts            the Standard 421 catalogue: every requirement with its paragraph
│   │   └── evaluate.ts         turns a logbook + profile into progress per goal
│   └── ui/
│       ├── Progress.tsx        goal detail, gates, requirement rows, milestone tick-offs, goal cards
│       ├── Welcome.tsx         a first visit: what the app is, the sign-up form, go on without (D27)
│       ├── Logbook.tsx         empty state, totals tiles, column totals, by-type table, entry list/cards
│       ├── EntryForm.tsx       the flight / FTD / paper-totals form and its questions
│       ├── Profile.tsx         AuthForm: sign up, sign in, forgot password (also on the welcome);
│       │                           licences held, medical, export / import, delete
│       ├── ResetPassword.tsx   where an emailed reset link opens: choose a new password (D28)
│       ├── useSlow.ts          true once a request has taken 4 s, to say the server is waking
│       └── icons.tsx
├── server/
│   ├── main.ts                 reads env, picks the database, starts Fastify
│   ├── app.ts                  routes, CORS, session hook, health check, static files, SPA fallback
│   ├── auth.ts                 scrypt hashing, random tokens (sessions, reset links), throttles
│   ├── mail.ts                 Resend over HTTP, printing on a laptop, the reset email (D28)
│   └── db.ts                   Store: every SQL statement in the project; pg or PGlite
├── test/
│   ├── web/                    jsdom: fixtures, entry, rules, app as guest, app signed in
│   └── server/                 node: the API through fastify.inject, on PGlite and (TEST_DATABASE_URL) Postgres
├── tsconfig.json               browser code: src, test/web (no Node types)
├── tsconfig.server.json        server, test/server, src/model, src/rules (Node types)
└── vite.config.ts              React plugin, base path (VITE_BASE), /api proxy to :8787, Vitest settings
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
| `POST /api/auth/forgot` | `{ email }` | 204 whether or not the email has a profile; the link is made and emailed after replying. 429 after 3 an hour to one email or 10 from one IP; 503 without `RESEND_API_KEY` and `APP_URL` |
| `POST /api/auth/reset` | `{ token, password }` | 400 short password, or a link that is unknown, used or over an hour old; otherwise sets the password, ends every session and sets the cookie for a new one |
| `GET /api/me` | | `{ user: { email } }` or 401; extends the session to 90 days from now and sets the cookie again |
| `GET /api/health` | | `{ ok: true }`, or 503 when the database doesn't answer; Render's health check |
| `DELETE /api/account` | `{ password }` | deletes the user; entries, profile and sessions cascade; 204 |
| `GET /api/logbook` | | `{ version: 2, entries, profile }` |
| `PUT /api/entries/:id` | an entry | parsed and validated with the same code as the browser; id must match |
| `DELETE /api/entries/:id` | | 204, only the caller's own entry |
| `PUT /api/profile` | a profile | replaces it |
| `POST /api/logbook/merge` | a logbook | adds what is missing, never overwrites; returns the result |

Any other `/api/*` is 404. Any other GET serves `index.html` (when `dist/` exists), so client-side
tabs survive a reload. The published API has no `dist/`: GitHub Pages serves the page.

With `ALLOWED_ORIGINS` set, `@fastify/cors` lets those origins call every route with credentials
(GET, POST, PUT, DELETE; preflights cached 2 hours). The published page is
`https://nberkyilmaz.com` calling `https://hours-to-go-api.nberkyilmaz.com`: different origins,
same site, so the SameSite=Lax cookie is sent.

## Database (`server/db.ts`)

Postgres. `Store.open(where)` takes a `postgres://` URL (Neon in production, through a `pg` pool
of 5 with an `error` listener, because a hosted database drops idle connections) or anything else
for PGlite: a folder (`data/pglite` by default) or `memory://` (the tests). Both sit behind a small
interface (`query`, `transaction`, `close`), so the SQL is the same everywhere.

```sql
users    (id text pk, email text unique, password_hash text, created_at timestamptz)
sessions (token_hash text pk, user_id → users on delete cascade, expires_at bigint /* ms */)
password_resets (token_hash text pk, user_id → users on delete cascade, expires_at bigint /* ms */)
entries  (user_id → users on delete cascade, id text, data jsonb, pk (user_id, id))
profiles (user_id pk → users on delete cascade, data jsonb)
```

The tables are created with `create table if not exists` when the store opens; there are no
migrations yet, so a change to an existing table needs one. Entry and profile JSON is passed
through the same parsers as files, so old formats are converted when read. A merge inserts the
whole incoming logbook in one statement (`jsonb_array_elements`), inside one transaction. Expired
sessions are swept whenever a new one is created, and expired reset links whenever a new one is.
A reset runs in one transaction: delete the link (`returning user_id`, so it can be spent once),
set the password, delete the profile's other links and every session.

## Client state (`src/useLogbook.ts`)

- On load, only if this browser was signed in last time (`wasSignedIn()`, localStorage
  `hours-to-go/signed-in`): `GET /api/me`. 200 means profile mode (load `/api/logbook`); 401 means
  guest; anything else means guest with an "offline" banner. Without the flag the app starts as a
  guest at once and calls nothing (D26). Entering a profile sets the flag; signing out, deleting
  the profile or a 401 clears it.
- A page opened at `#reset=<token>` shows `ResetPassword` before anything else, and takes the
  token out of the address bar. A `hashchange` does the same, for a link pasted into a tab that
  already has the app open. `resetPassword` signs in like `signIn`.
- `welcomed` (localStorage `hours-to-go/welcomed`, or the signed-in flag): until it is set, a
  guest with nothing logged sees the welcome screen instead of the tabs (D27). Entering a profile
  or "Continue without a profile" sets it. `AuthForm` pings `/api/health` on the first focus
  inside it.
- `src/api.ts` prefixes every path with `VITE_API` (empty: the page's own server) and sends
  `credentials: 'include'`, so the cookie also goes to the API's subdomain.
- `book` is what the screens show. `guest` is what is saved in this browser; while signed in, any
  guest entries trigger the "add them to your profile" banner.
- Every change goes through `change(apply, save)`: apply locally at once, then (signed in) queue the
  server call. Failures set the error banner and reload the server copy.
- `signUp` merges the device's guest log into the new profile and clears it from the browser.

## Screens

- **Welcome** (first visit only, D27): graphite header with what the app does; a card with "Create your
  free profile" (or "Welcome back" on the Sign in tab), the form, and "Continue without a
  profile"; three points on what the app does; the "not an official record" line.
- **Masthead**: the graphite bar with name, tabs (a bottom bar on a phone), and either "Saved to
  your profile" or, for a guest, "Saved on this device only" (not on a phone) and a cyan
  "Create profile".
- **Progress**: "Working on" picker; the goal's name, citation link, "Mark … as held" or held date;
  "You hold: …"; least flying left and requirements met; unlock cards ("You can write it", "Passed");
  the training-window box for CPL and Class 4; every requirement with a bar, figures, notes, credits
  and hints; milestones are ticked from the status circle and take a date and mark; under each written
  exam, a "Can you write the … yet?" checklist with the photo-ID reminder. Below, a card per goal.
- **Logbook**: empty, one card saying where to start (paper totals first, then a flight or FTD
  session). Otherwise Log a flight, Log FTD session, Add paper logbook totals; totals tiles;
  "Every column, laid out like your paper logbook"; "By aircraft type"; the entry list. Entries open
  the form in the layout they were made with.
- **Profile**: create profile / sign in (or signed-in status, sign out, delete with password);
  licences and ratings held with issue dates; medical; export, import (merge), erase this device's
  guest log; the "not an official record" notice with the link to Standard 421.

## Phone and home screen

The manifest and icons let the app be added to a home screen (standalone display). The
manifest's `start_url`, `scope` and icon paths are relative to the manifest, so the installed app
opens at `/hours-to-go/` when published and at `/` locally. There is no service worker, so it needs
a connection to load; a signed-out device keeps working from localStorage once loaded.
