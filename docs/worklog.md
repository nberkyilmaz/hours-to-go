# Worklog

Phases 1 to 9 happened on 2026-10-20, phase 10 on 2026-10-27 and phases 11 and 12 on 2026-10-28, in this order. Each phase says what was asked for,
what was built, what went wrong, and what it changed. Problems are written up in enough detail
that nobody has to rediscover them.

The app was designed around a real student's log: the owner holds a PPL and a night rating, is
training for the Instrument Rating Group 3 (Group 1 later), flies a C172 out of CYSN
(St. Catharines), has about 26 h of cross-country, a little over 40 h PIC, 3.5 h of PIC night, and
34 night takeoffs and landings. All of their PIC time has been solo. Those numbers appear in the
tests on purpose.

---

## Phase 1: the brief and the rules

**Asked for.** A new app, separate from the owner's other project, for student pilots to log
their hours and see what is left for each licence and rating: PPL, CPL, IFR Group 3, IFR Group 1,
and anything else on the usual Canadian route. Transport Canada only for now, other countries
maybe later. The owner also mentioned they believed the INRAT written exam only unlocks after
about 20 of the 40 instrument hours.

**Done.**

- Downloaded CAR Standard 421 (Flight Crew Permits, Licences and Ratings) from tc.canada.ca,
  converted the HTML to text, and read the sections for every goal: 421.26 PPL, 421.30 CPL,
  421.34 ATPL, 421.38 class ratings, 421.42 night, 421.44 VFR OTT, 421.46 instrument,
  421.69 Class 4 instructor, plus 421.13 (exam prerequisites) and 421.14 (flight test
  prerequisites). Text current to NSA 2025-008, effective 2025-12-17. Details in
  [transport-canada-rules.md](transport-canada-rules.md).
- Several numbers differed from what memory would have said. Writing the rules from the source
  rather than from recollection was the right call and should stay the rule.
- **Finding for the owner:** 421.13(4)(d), amended 2024-10-10, says an INRAT applicant needs only
  **5 hours of instrument flight or ground time**. The "20 of 40" belief is either the old wording
  or a school policy. The app uses the current text and the README says so.
- **Finding for the owner:** the IFR 50 h cross-country must be **as PIC**. Dual cross-country does
  not count, so with about 26 h of PIC cross-country there are about 24 h to go. That is likely
  the last IFR requirement they will meet.

**Chosen.** Same stack as the owner's other project (TypeScript, React 18, Vite 6, Vitest 2),
because they already know it. Folder `Desktop\hours-to-go`, app name "Hours to Go".

## Phase 2: first build, browser only

**Built.**

- A requirement catalogue (`src/rules/goals.ts`) for PPL, Night, VFR OTT, CPL, Multi-engine,
  IFR Group 3, IFR Group 1, Class 4 instructor and ATPL. Every requirement carries its paragraph
  number. Kinds: hours, counts, milestones (exams, ground school, special flights, flight tests),
  "licence held" prerequisites, medical category, and info rows.
- An evaluator (`src/rules/evaluate.ts`) giving have/need/met per requirement, gates ("write the
  exam", "take the flight test") with what still blocks them, and a "least flying left" figure
  (the largest single shortfall, because one flight can count toward several requirements).
- Times stored as whole minutes so totals add up exactly. Input accepts `1.3` or `1:18`.
- Logbook, Progress and Profile screens; guest storage in localStorage; JSON export and import.

At this point each logbook line had **one role** (dual, solo, PIC or co-pilot) plus a total and a
night part. That model was replaced in Phase 5.

## Phase 3: profiles and phones (changed mid-build)

**Asked for, while Phase 2 was being written:** "pretty much a logbook" that also shows what is
left per rating; usable on both computer and phone; people must be able to create a profile so
they don't lose their progress.

**Built.**

- A Fastify server (`server/`) serving the API and the built app from one process.
- Accounts with email and password: scrypt hashes with their parameters stored, random session
  tokens in an HttpOnly, SameSite=Lax cookie for 90 days, only a SHA-256 of the token in the
  database, a failed-sign-in throttle (10 per 15 minutes per IP and email), and account deletion
  that needs the password.
- SQLite through Node's built-in `node:sqlite`, so there are no native modules to compile on
  Windows. Entries are one row each so two devices editing different flights never overwrite each
  other.
- A guest mode that keeps working without an account. Signing up moves the device's log into the
  new profile. Signing in with a guest log on the device offers to add it. Merges never delete and
  never overwrite.
- Phone layout: bottom tab bar, logbook rows become cards, 44 px touch targets, 16 px inputs (iOS
  zooms below that), `inputMode` for number keypads, a web manifest and icons so it can be added
  to the home screen. The PNG icons were drawn by a small script because no image tool was
  installed; the source of truth is `public/icon.svg`.

**Problems hit.**

1. *Vitest could not load `node:sqlite`.* Vite strips the `node:` prefix from imports it doesn't
   recognise, and `sqlite` only exists with the prefix. The fix is in `server/db.ts`: load it with
   `createRequire(import.meta.url)('node:sqlite')` and import only the type. Keep that comment.
2. *`vite.config.ts` failed the typecheck.* Vitest 2 ships its own copy of Vite 5 types, which
   don't match Vite 6 with `exactOptionalPropertyTypes`. The config file is left out of both
   tsconfigs; the owner's other project does the same.
3. *Two tsconfigs.* Browser code must not see Node types and the server needs them, so
   `tsconfig.json` covers `src` and `test/web`, and `tsconfig.server.json` adds Node types for
   `server`, `test/server`, `src/model` and `src/rules`. `npm run typecheck` runs both.

## Phase 4: checking it in a real browser

The app was driven in the installed Microsoft Edge with `playwright-core` (installed in a scratch
folder, not in the project) at 1280×900 and at phone size (390×844, touch, 2× scale), in light
and dark. How to do this again is in [runbook.md](runbook.md#checking-the-ui-in-a-real-browser).
This step found real bugs that the jsdom tests could not.

1. **Phone tab bar drawn at the top of the screen.** The header had `backdrop-filter: blur()`,
   which makes the header the containing block for `position: fixed` children, so the "bottom"
   bar sat against the header. Fixed by turning the filter off on narrow screens. If the header
   style changes, check this again.
2. **Signed-in changes felt broken on a phone.** The first version waited for the server before
   showing a change, so a checkbox didn't flip until the request returned and a second tap undid
   the first. Changed to showing the change at once and saving in order through a queue. If a
   save fails, the server's copy is loaded back and a banner says the change wasn't saved. A 401
   drops back to guest mode with a message. There is a test for the failure path.
3. **A gate card stretched to its neighbour's height.** `align-items: start` on the grid.
4. **Rebuilt files 404'd.** `@fastify/static` with `wildcard: false` registers a route per file at
   startup, so after `vite build` the running server doesn't know the new hashed file names.
   Restart the server after every build.
5. **The old server kept running.** On Windows, stopping the shell that ran `npx tsx …` can leave
   the `node.exe` child alive and holding the port. See the runbook for finding and stopping it.

## Phase 5: the paper-log columns

**Owner feedback after testing.** A pilot flies more than one aircraft type (Piper dual, Piper solo,
Cessna dual, Cessna solo) and each should count. The owner read out their paper logbook's columns
and asked for the app to match them exactly:

- single-engine day: dual, PIC; single-engine night: dual, PIC
- multi-engine day: dual, PIC, co-pilot; multi-engine night: dual, PIC, co-pilot
- cross-country: day dual, day PIC, night dual, night PIC
- instrument: actual IMC, hood, FTD, IFR approaches
- takeoffs and landings: day, night
- From and To

Those ten flight-time columns add up to the grand total. Cross-country and instrument time are
the same time logged a second way. The owner also asked whether a photo of the logbook could be
read in automatically (see Phase 8).

**Built.**

- `src/model/entry.ts` rewritten around those columns. `derive()` works out what a line
  contributes (dual, PIC, night, solo, PIC cross-country, dual instrument and so on), and every
  requirement reads from it. "Kind" (flight or simulator) went away: an FTD session is a line with
  only FTD time.
- Lines saved in the first format are converted when read (`fromFirstVersion` in
  `src/model/store.ts`), including splitting a route like `CYSN-CYHM-CYKF` into From, To and a
  "via CYHM" remark. Logbook files are now version 2; version 1 is still accepted.
- Entry form rebuilt as the paper page: a box per column, grouped the same way, multi-engine
  behind a link, a running "flight time on this line" in the footer, suggestions for types,
  registrations and aerodromes already used, a separate FTD-session layout.
- Logbook screen: column totals laid out like the paper page (to compare with the "total to date"
  line), totals by aircraft type, and a list that becomes cards on a phone.

**Problems hit.**

1. **On a phone the entry form ran off the bottom of the screen and Save could not be reached.**
   This had been there since Phase 3. The sheet sat in a grid whose row grew to fit the content.
   Fixed with `grid-template: minmax(0, 1fr) / minmax(0, 1fr)` on the backdrop and
   `max-height: 100%` on the sheet, then measured: Save at y = 786–830 on an 844 px screen.
2. From/To placeholders were cut off on a phone; registration, From and To now share a row of
   three. A long instrument label was cut off; labels now wrap and inputs align to the bottom.
3. Aircraft names with badges were truncated with an ellipsis; that cell now wraps.

## Phase 6: "does it know I have my PPL?" and solo night

**Owner reports.**

1. After marking the PPL as held, the IFR Group 3 page didn't seem to know, and they felt they had
   to click the "I already hold this" button.
2. Solo night showed 0 although all of their 3.5 h PIC night was solo.
3. 34 night takeoffs and landings were entered, but "10 solo night takeoffs, circuits and
   landings" showed 0.

**Found.**

1. Not a logic bug. The prerequisite had a green tick, but it was low on the page and didn't say
   which licence it meant, and the big button at the top meant "I hold IFR Group 3 itself". Clicking
   it would have marked the rating as done. Now the button reads "Mark IFR Group 3 as held", the
   page says "You hold: PPL", and the prerequisite says "You hold the Private Pilot Licence —
   Aeroplane, since …". Lesson: a button on a goal's page must name the goal.
2. and 3. A real design flaw. Solo was a tick box on a line, and validation refused Solo on a
   line that also had dual time, which a paper "total to date" line always has. So nothing could
   be counted as solo. First fix: allow Solo on a mixed line, ask how many night landings were solo
   when the line also has night dual, and show a hint on any solo requirement that is short
   ("3.5 h of PIC night time in your log isn't counted as solo…").

## Phase 7: paper totals in one entry

**Owner feedback.** Ticking boxes and making several entries is not convenient. It should be one
entry that says, out of all the dual, how much was PPL, night, CPL, and of the night landings how
many were solo.

**Decided.** Ask only what the Transport Canada rules need and the paper columns can't show. The
night rating and IFR count every hour regardless of which course it was flown in, so splitting
dual by course would be busywork. Only two splits matter:

- **Solo**, for the PPL, night rating and CPL: "How much of your PIC time was solo?" All / None /
  Some (solo by day, at night, cross-country). Plus "How many of the N night takeoffs & landings
  were solo?" when the totals also hold night dual.
- **After the PPL**, for the CPL's 65 h of commercial training: "How much of these totals did you
  fly after your PPL was issued?" None / All / Some (dual, dual at night, dual night cross-country,
  dual cross-country, dual instrument, FTD, solo, solo at night, solo night takeoffs and landings).
  Only shown to someone who holds a PPL.

**Bug found while doing it.** A single totals line dated today, after the PPL date, was being
counted entirely as CPL training, PPL training included. CPL training is now worked out per line:
flights by date, paper totals by their answer (`afterPplPart` in `src/model/entry.ts`). A totals
line with no answer still counts in full, and the CPL page says so and asks for an answer.

Single flights keep one "Solo flight" tick box, since for one flight that is the quickest way to
say it.

**Problems hit.** The answer pills hide the real radio buttons behind their labels (a common
pattern), so an automated click on the radio fails; click the label, as a person does.

## Phase 8: reading a logbook photo (dropped)

The owner asked whether a photo of the paper logbook could be read in. It could: a hosted vision
model reads the handwriting, the numbers fill the paper-totals form, and the pilot checks each box
before saving. That would mean an API key on the server, a charge per photo, and photos going to
that provider. **The owner decided against it:** pilots can type their totals in, and the
one-entry form from Phase 7 makes that quick. Don't build it unless they ask again.

## Phase 9: can I write the exam yet?

**Owner feedback.** The pages list the written exams (PPAER, CPAER, INRAT, SAMRA, SARON) but not
what you need before Transport Canada lets you write them. Add a section that checks whether you
qualify yet.

**Found.** Each goal already had a small "Write the …" card at the top, but it only showed the
hours rule from 421.13(4), and nothing sat next to the exam itself. 421.13 asks for more:

- (1) a medical for the licence or rating (Category 3 or 1 for PPAER and INRAT, Category 1 for CPAER,
  SAMRA, SARON and AIRAF)
- (2) photo ID on the day
- (3) a recommendation letter for the PPAER and CPAER (flight school or instructor) and the AIRAF
  (ground instructor), saying ground school is finished, dated within the 60 days before the exam,
  usable once. **No letter is needed for INRAT, SAMRA or SARON.**
- (4) the share of experience (5 h; 25% of the total; 5 h instrument; 25% of instructor training
  plus all ground school)

**Built.**

- One check per written exam (`EXAM_CHECKS` in `src/rules/goals.ts`), used both by the
  "Write the …" card and by a new **"Can you write the … yet?"** checklist shown under the exam
  wherever it appears. INRAT is checked on the IFR pages and on the ATPL page.
- Letter-of-recommendation tick-offs in Knowledge for the PPL, CPL and Class 4. A letter dated more
  than 60 days ago stops counting and says to ask for a new one. Once the exam is passed the
  letter shows as used, so it never holds a licence open.
- The card at the top says "You can write it" when ready and "Passed" once the exam is passed.
- The evaluator now takes today's date (for the 60-day rule). Exam conditions are always judged
  on the goal's own training window, so the AIRAF's 25% counts only instructor-course training even
  though the exam sits in the Knowledge section.

Checked in Edge on desktop and phone; 78 tests pass.

## Phase 10: putting it at nberkyilmaz.com/hours-to-go (2026-10-27)

**Owner request.** Host it under the owner's domain, at `nberkyilmaz.com/hours-to-go`.

**Found.** `nberkyilmaz.com` is registered at Cloudflare, with no website on it yet (only the
Email Routing records). departure-brief had already planned the domain: the account's user site
`nberkyilmaz.github.io` carries it, and every project's Pages site appears at a path beneath it.
That plan even listed `hours-to-go`. But this app has a server, and GitHub Pages serves files.
Free hosts for the server wipe their disk on deploy (Render's free plan also on every sleep), so
the SQLite file would have lost every profile.

**Built** (decisions D14, D25, D26 in [decisions.md](decisions.md)):

- **Postgres instead of SQLite.** `Store` talks to a three-call interface: `pg` for Neon in
  production, PGlite (Postgres in WebAssembly) on a laptop and in tests. `DATABASE_URL` replaces
  `DATABASE_PATH`, and production refuses to start without it. A merge is one statement now, not
  one per entry, because each round trip to a hosted database costs milliseconds.
- **The page builds for a path** (`VITE_BASE`), the manifest's paths are relative so the
  home-screen app opens at `/hours-to-go/`, and the page calls the API at `VITE_API` with
  `credentials: 'include'`.
- **The API allows the page's origin** (`ALLOWED_ORIGINS`, `@fastify/cors` with credentials), has
  `/api/health` for Render, and `/api/me` renews the session and cookie on every open.
- **Never-signed-in browsers don't wait for a sleeping server.** They open as a guest at once and
  make no API call. Opening the sign-up form wakes the server. A signed-in pilot whose server is
  asleep sees, after 4 seconds, that it can take up to a minute.
- `Dockerfile` (API only), `render.yaml`, `.github/workflows/pages.yml` (needs the `API_URL`
  variable), `.github/workflows/ci.yml` (tests on PGlite and on a Postgres service, the page built
  as published, the image built and started), and [deploy.md](deploy.md) with the owner's steps.

**Problems on the way.**

1. *The API's address decides whether sign-in works.* A cookie from `*.onrender.com` is
   third-party to a page on `nberkyilmaz.com`, and browsers drop it silently: sign-in "succeeds"
   and the next request is signed out. So the API goes on `hours-to-go-api.nberkyilmaz.com`, the
   same site as the page. For the same reason the page at `nberkyilmaz.github.io/hours-to-go/`
   (before the domain is attached) can't sign in, and CORS refuses it on purpose.
2. *Safari caps that cookie at 7 days* when the API answers from a different server than the page,
   which here it always does. Without renewal an iPhone would sign out every week, against D15. Now
   `/api/me` sets it again on every open.
3. *A sleeping free server made everyone wait.* The app asked `/api/me` before showing anything, so
   every portfolio visitor would have watched "Loading your logbook…" for up to a minute. Hence
   the signed-in flag (D26).
4. *Git Bash rewrote the base path.* `VITE_BASE=/hours-to-go/` became
   `/Program Files/Git/hours-to-go/` in `dist/index.html`. Git Bash converts anything that looks
   like a Unix path. `MSYS_NO_PATHCONV=1` fixes it locally; CI is on Linux.
5. *Docker Desktop wasn't running*, so the `pg` path was tested through PGlite's socket server
   (`@electric-sql/pglite-socket`, from a scratch folder) and the image's file set was rebuilt by
   hand: `npm ci --omit=dev`, `server/` and `src/model/` only, started with
   `NODE_ENV=production`. CI builds and starts the real image.
6. *Another session briefly edited this checkout* (it had been asked for a page-only Pages copy).
   It reverted everything, but its checkout left 20 files with CRLF line endings. Git saw no
   change, but scripted edits stopped matching. They were turned back to LF.

**Checked** in Edge with two hostnames mapped to this machine, so the page and API were on
different hosts of one site, as in production: sign up on a phone-sized page, log a flight,
reload (still signed in, flight there, cookie HttpOnly / Lax / 90 days on the API's host), sign in
from a desktop context (same flight), sign out and reload (no API call at all), open Profile (one
`/api/health` wake-up). The waking-server note was checked at phone size in light and dark.
No console errors, no failed requests.

## Phase 11: live, and a welcome that recommends a profile (2026-10-28)

**Going live.** The owner did the steps in [deploy.md](deploy.md), one at a time:
- Neon project `hours-to-go` in AWS US East 2 (Ohio), running Postgres 18. The app was run from
  the laptop against it before Render existed: sign up, save a flight, restart, sign in, flight
  there, delete the profile, database empty again.
- The Render blueprint, `hours-to-go-api.nberkyilmaz.com` with a CNAME at Cloudflare, the user
  site `nberkyilmaz.github.io` pushed with the domain on it, the four A and four AAAA records and
  `www`, and this repository's Pages with `API_URL`. The departure-brief session set `API_URL` and
  turned Pages on, with the owner's go-ahead.

Problems on the way:
1. *The Neon connection string was pasted into the chat.* The database was still empty. The
   password was reset in Neon before Render, and only the new string went into Render.
2. *`pg` prints a "SECURITY WARNING" about SSL modes* for Neon's `sslmode=require`. It means the
   certificate is checked in full, which Neon passes. Noted in deploy.md so it doesn't look like a
   fault.
3. *CI tested against Postgres 17; Neon runs 18.* CI's service image is now `postgres:18`.
4. *GitHub's DNS check kept its first result* ("improperly configured", from before the records
   existed). It cleared once GitHub checked again; re-saving the custom domain forces that.
5. *Signing in failed on `http://nberkyilmaz.com/hours-to-go/`* before the certificate was issued.
   That is by design: CORS allows only `https://nberkyilmaz.com`. A guest log made on the http
   page is invisible to the https one, since they are different origins.
6. *Enforce HTTPS is per project site.* The user site had it; `hours-to-go` didn't, and the tick in
   the UI didn't save. Set through the API (`PUT /repos/nberkyilmaz/hours-to-go/pages`,
   `https_enforced=true`); http started redirecting within minutes.

**Owner request.** A better UX and UI, and recommend creating a profile when the app opens.

The first version also matched the new nberkyilmaz.com ("sky and sunset"), from design tokens
the departure-brief session passed on. The owner turned that down: the apps are separate products
from the portfolio and will go to the App Store and Google Play, so each needs its own theme and
font. Of three directions offered (glass cockpit, native phone app, taxiway sign), the owner chose
glass cockpit. Two details changed after that. Its magenta read as pink, which the owner didn't
want, so the colour is cyan, the cockpit's other set-value colour. And its first font, Barlow,
turned out to be Departure Brief's already, so the headings are in B612, Airbus's cockpit-display
typeface, as the departure-brief session suggested.

**Built** (D21 rewritten, D26 amended, D27 new):
- **A welcome screen on a first visit**: what the app does, the sign-up form with a Sign in tab,
  "Continue without a profile". It wakes the server only once the pilot starts on the form.
- **Its own look, "glass cockpit"**: a graphite bar with a cyan line along it, white pages,
  cyan for the main action and progress, B612 for the name, headings, buttons and big figures,
  the phone's own font for reading, squarer corners. The mark and home-screen icons are the
  progress ring in cyan on graphite.
- **A guest's "Create profile" button in the masthead**, beside "Saved on this device only" on
  wider screens.
- **An empty logbook that says where to start**, instead of eight totals of 0.0. A flight with no
  aircraft says so instead of showing a dash.
- **A slow sign-up says why** after 4 seconds (the server waking), like the loading screen does.
- **Adjustments after looking at it.**
  - The app colour was everywhere: the guest notice was a filled box holding a coloured button
    under another in the header. Notices are now white with a coloured edge.
  - Small sizes (citations, hints, column labels) went up a pixel, none below 13 px.
  - B612's parentheses are flat-sided and read as brackets at citation size ("421.26[4][a]"),
    found by rendering both side by side. So B612 sets only the display layer and the phone's
    font sets everything read.
  - The welcome's buttons sit low on a phone, and the app opened at the same scroll position,
    cut off at the top. Each new screen and tab now opens at its top.
- **A broken block in `styles.css` repaired.** A run of form rules had been pasted into the middle
  of `.sheet-foot .line-total` inside the phone rules. Browsers recovered, so nothing looked
  wrong, but the rules were duplicated and the intended one was lost.

**Checked** in Edge at 390×844 (light and dark) and 1280×800, against the dev server and a
throwaway database:
- The welcome screen.
- Going on without a profile: the empty logbook, logging a flight, Progress, Profile.
- Signing up from the welcome: no API call until the email field got focus, then `/api/health`,
  `/api/auth/signup`, `/api/logbook`; the masthead then said "Saved to your profile".
- The signed-in Profile, and the sky loading screen with a server that doesn't answer.
- No console errors.

## Phase 12: a forgotten password (2026-10-28)

**Owner request.** "If people forget their password we can send their email a link to reset
password."

**Built** (D28):
- "Forgot your password?" on the Sign in tab, on the Profile tab and on the welcome screen. It
  answers the same whether or not the email has a profile.
- The emailed link, `https://nberkyilmaz.com/hours-to-go/#reset=…`, opens "Choose a new
  password". Saving signs in, signs out every other device, and spends the link.
- `POST /api/auth/forgot` and `POST /api/auth/reset`; a new `password_resets` table (a new
  table, so no migration); Resend over HTTP in `server/mail.ts`, and printing in development.
- `RESEND_API_KEY`, `MAIL_FROM` and `APP_URL` in `render.yaml`; the key is pasted in Render.

**Problems on the way.**
1. *A link pasted into a tab already showing the app did nothing.* Only the fragment changed, so
   the page didn't load again and the token was never read. The app now listens for `hashchange`
   too. Found by the browser run, which opened the spent link in the same tab.
2. *Two things were called "New password".* The reset card was labelled by its own heading, which
   matched the field's label, so tests couldn't tell them apart. The heading only repeated the
   page title, so it went, and the card is labelled by the title.
3. *The checkout came back with CRLF line endings* after pulling the merged redesign, because
   `core.autocrlf` is on. Multi-line scripted edits stopped matching. Converted back to LF; the
   runbook already says to keep LF.
4. *CI failed every test on its Postgres server.* The test helper drops the tables before each
   test, and didn't list `password_resets`, whose key on `users` stopped `users` being dropped.
   PGlite tests start from a fresh in-memory database each time, so they never drop anything and
   passed. The helper now drops `password_resets` too, and the suite was run locally against
   `pglite-server` (Postgres's wire protocol, through `pg`) before pushing again. A new table
   that references `users` has to be added to that list.

**Checked.**
- Server tests, on PGlite and on a Postgres server in CI: a link that sets a new password and
  signs in; the same reply for an unknown email, with nothing sent; one use only, other sessions
  ended; expiry after an hour; short passwords and made-up links refused; three emails an hour
  per address; 503 without a mailer.
- Web tests: asking for a link from the welcome's Sign in tab, opening a link and being signed
  in, and an expired link.
- In Edge at phone size against the dev servers:
  - Sign up, sign out, ask for a link, and read the email the API printed.
  - Open the link in a fresh browser: the token left the address bar, and the new password
    signed in.
  - The spent link was refused, the old password gave 401 and the new one 200.
  - The reset screen in light and dark mode, and on a desktop.

## Phase 13: the road to going public, and the first fixes (2026-10-29)

**Owner request.** "Can you look from a user's side and try to find things that could improve
this?" A run through the live page as a new pilot at phone size found no errors. It turned up gaps
around the app more than in it: no backups, no privacy page, no way to reach anyone, a minute's
wait on a sleeping server, no change of email or password, no error alerts and no link previews.
It also turned up features pilots would want. The owner agreed to all of it, asked to start with
backups, a privacy page and a way to reach them, and to leave out anything that costs money until
there are users (D32). The whole plan is in [roadmap.md](roadmap.md).

**Built:**
- **Backups** (D29): a workflow and README for the private repository
  `nberkyilmaz/hours-to-go-backups`, which copies, test-restores and keeps the database every night.
- **A privacy and terms page** (D30), at `/hours-to-go/privacy/`. It is a second Vite input, also
  published by the Pages workflow (which now fails if the page is missing), and is linked from the
  welcome, the sign-up form and Profile.
- **"Send feedback"** on the Profile tab (D31), `POST /api/feedback`, and `FEEDBACK_TO` in
  `render.yaml` (typed in the dashboard). Waking the sleeping server on a form's first focus moved
  into `useWake()` beside `useSlow()`, for the sign-in form and this one.

**Problems on the way:**
1. *Creating the private repository from here was refused* by the session's permission check,
   because it publishes to GitHub. That step was left to the owner to approve.
2. *Docker Desktop wasn't running*, so the copy and restore couldn't be tried on this machine. The
   workflow runs on its own pull request instead, against the real database, once the secret is set.
3. *Git Bash rewrites paths in environment variables.* `VITE_BASE=/hours-to-go/` became
   `C:/Program Files/Git/hours-to-go/`, and the first local build linked its assets there.
   `MSYS_NO_PATHCONV=1` stops that. But it also passes a `/c/Users/…` argument through
   unchanged, so `--outDir /c/Users/…` built into a new folder, `C:\c\Users\…`. With it, give
   Windows paths (`C:/Users/…`). Added to the runbook. The stray `C:\c` folder holds only that
   build output; the safety check stopped its removal, so it was left for the owner to delete.
4. *Port 8787 was taken by departure-brief's dev server*, from the owner's other project. The check
   ran this API on 8797 instead, with a build of the page pointed at it.

**Checked:**
- **Server tests**, per database:
  - a guest's message with a reply address, its HTML escaped;
  - no address given;
  - signed in, the profile's address wins;
  - an empty or too-long message, and a bad address, refused;
  - 5 an hour;
  - 503 without a mailer, and 502 when sending fails.
- **Web tests**: a guest sends and gets "Thanks"; a failed send keeps the message; the privacy
  links point at `/privacy/`; signed in, it asks for no address.
- **In Edge**, against a build published under `/hours-to-go/` and the API on 8797:
  - the consent line and the welcome's link;
  - the privacy page at phone size in light and dark, and on a desktop (B612 headings, no
    sideways scroll), and back to the app;
  - a guest's message and a signed-in one, both printed by the API with the right Reply-To.

## Phase 14: confirming and changing an email, and the password (2026-10-31)

**Owner request.** "Let's go with confirm email and change email", then the rest of the first
group of gaps on the roadmap, starting with whatever could be built at once. This phase is the
account part of that group; error alerts, link previews, the phone's top bar and the
`@fastify/static` update come next.

**Built:**
- **Migrations** (D33): `MIGRATIONS` in `server/db.ts`, numbered steps recorded in a
  `migrations` table, run in one locked transaction at start-up. Step 1 is the old table list.
  Step 2 adds `users.email_confirmed_at` and `email_links`.
- **Confirming an email** (D34): a link emailed after sign-up (`#confirm=<token>`, 7 days, once),
  `POST /api/auth/confirm` to spend it, `POST /api/account/confirm` for a new one. The page opens
  such a link on `ConfirmEmail`. A banner above Progress and Logbook and a notice on Profile ask
  for it until it's done. A reset link confirms the address too.
- **Changing email and password** (D35): `POST` and `DELETE /api/account/email`, `POST
  /api/account/password`, all asking for the current password. The signed-in part of Profile
  moved into `src/ui/Account.tsx`, with the two forms beside "Delete my profile".
- **Sign-up limit** (D36): 20 an hour from one IP.
- `/api/me`, sign-up, sign-in and reset now answer `{ email, confirmed, pendingEmail }`.
- The privacy page lists the confirm links and the date an address was confirmed.

**Checked:**
- **Server tests**, per database:
  - the sign-up's link confirms once, signed in or not;
  - a new link a few times an hour, then 429, and none once confirmed;
  - links expire after 7 days;
  - a change moves the profile only once its link is opened;
  - a change needs the password and an address no other profile has;
  - only the newest change counts, and it can be cancelled;
  - after a move, neither an old confirm link nor an old reset link works;
  - a move stops if the address was taken in the meantime;
  - a new password signs out the other device only, and wrong guesses hit 429;
  - 20 sign-ups an hour;
  - a database made by the first release, with a pilot in it, upgrades, and a second start runs
    nothing again.
- **Web tests**: the banner and "Send a new link", and "Later"; changing email and cancelling it;
  changing password, with a wrong old one first; a confirm link opened signed out, one that moved
  a profile, and an expired one.
- **In Edge**, against a build under `/hours-to-go/` and the API on 8797 printing its emails, at
  phone size and on a desktop, light and dark:
  - signing up shows the banner, and the Profile notice sends a new link;
  - the emailed link confirms, takes the token out of the address bar, and the notices go;
  - the first link then says it didn't work;
  - changing email waits, and the link opened in another browser moves the profile;
  - changing password keeps this device signed in.
  No console errors.

## Phase 15: error alerts, link previews, the phone's top bar, updates (2026-10-31)

**Owner request.** The same as phase 14: the first group of gaps on the roadmap, whatever could be
built at once. This is the rest of it. What's left in that group needs the owner or the flight
school: the instructor's check, and settings in GitHub and Cloudflare.

**Built:**
- **Error alerts** (D37): a Fastify error handler answers a failure with a plain sentence and
  emails `FEEDBACK_TO` the method, path and stack, at most 5 an hour. Emails that couldn't be sent
  alert the same way.
- **Link previews** (D38): Open Graph tags in `index.html` and `public/og.png`.
- **The top bar on a phone**: signed in, the badge says "Saved" (its label still says "Saved to
  your profile"), and the name keeps to one line.
- **Deploys wait for CI**: `autoDeployTrigger: checksPass` in `render.yaml`.
- **Updates**: `@fastify/static` 8 → 10.1.8 for its path-traversal advisories, `glob` held at
  14.0.3 under it, Vitest 2 → 5 and Vite 6.4.5 for the test and build tools' advisories.
  `npm audit` finds nothing.

**Problems on the way:**
1. *A space went missing* in phase 14's mail code (`={`), from an edit that ended on a space. It
   was put back with a commit on that pull request.
2. *The migration test timed out* in the full run: PGlite opens a folder in a second or two, the
   test opens one three times, and other test files run alongside. It has 30 seconds now.

**Checked:**
- **Server tests**: a route that throws answers 500 with the plain sentence, emails the owner
  without the request's body, and stops after 5 an hour; bad JSON answers 400 and emails nobody;
  a confirm email that Resend refuses alerts the owner.
- All 129 tests pass on Vitest 5.
- `npm start`'s one process, with `dist/` built: the page, the privacy page, assets and app paths
  load, and `..` tricks (`%2e%2e`, `%2f`, `%5c`) get the app page, never a file outside `dist/`.
- **In Edge**, signed in: the name on one line at 390, 360 and 320 px wide, light and dark, with
  no sideways scroll; the desktop bar unchanged. The built page carries every `og:` tag and
  `og.png`.

## Phase 16: cost to go (2026-11-04)

**Owner request.** Start the features (roadmap, section 3) with the cost to go. The owner's
figures: "most flight school numbers are C172 wet 220 dollars plus tax, but do check on their
website", the instructor on top for dual, and a deep look at how the numbers are worked out.

**Research.** School websites on 2026-11-04 (sources in D39). $220 is Waterloo Wellington Flight
Centre's C172S, before a $15 fuel surcharge; Ontario clubs run $195 to $259, private schools and
the west $260 to $355. Instructors are $80 to $95. Schools' own PPL estimates put the hours past
the 17 h dual and 12 h solo minimums with the instructor (33 + 12 at the minimum; 51.2 + 15.8 at
the 65 h Ontario Flight Centre quotes as the national average). The CRA's GST/HST Memorandum 20-4
taxes PPL training and private ratings, and exempts commercial, instrument and instructor training
at a vocational school up to the minimum hours.

**Built** (D39):
- Each goal in `goals.ts` has a plan of the least time left to pay for: dual, simulator, and solo
  or PIC. Multi-engine and the ATPL say why they aren't priced.
- `src/rules/cost.ts` bills each kind in tenths of an hour, rounded up, adds tax, and rounds the
  headline to $100.
- On Progress, the price sits beside the hours ("left to pay, about"; its own row on a phone).
  "How the cost is worked out" lists the lines, what each hour past the minimum adds, the price at
  65 h for the PPL, how the plan is laid out, what isn't counted, and the rates form.
- `profile.rates`, null until entered. Sample rates until then: $220, $90, 13%, no simulator.
- The privacy page lists the rates among the settings kept.

**Problems on the way:**
1. *Hand-built test profile.* `withSim(cplPilot())` spread a whole profile over the simulator
   rate, so its `rates: null` won, and the CPL test with a simulator got no simulator. The test
   was wrong, not the plan; the helper now takes the rates as a change.
2. *The box lost focus at the first key.* The rates form was keyed on whether the rates were the
   pilot's own, and the first key typed makes them so, which rebuilt the box being typed in. The
   tests filled whole values at once and missed it; Edge typing a key at a time showed it. Now only
   "Use the sample rates" refills the boxes. And the panel no longer hides at a $0 price, which it
   did while a pilot cleared both rates to retype them. A test checks the box survives both.
3. *The page didn't go live.* After the merge on 2026-11-05, GitHub Pages sat on "updating_pages"
   for the deploy step's 10 minutes and gave up, probably because departure-brief was publishing to
   nberkyilmaz.com in the same minute. Re-running the step, then running the whole workflow again,
   timed out the same way: the deploy is named after the commit, and that commit's was cancelled
   for good. A new commit on `main` gets past it (docs/deploy.md, step 5). Looking at the merged
   build in Edge on the way, "· sample rates" broke with "rates" alone on a phone's second line;
   it now moves down whole.

**Checked:**
- 18 new tests: every plan from an empty log and part-way, the simulator rule (the CPL's 35 h
  dual stays in the aeroplane), every plan covering at least D4's figure, the billing and
  rounding, parsing and merging the rates, the screen with sample rates, then the school's, kept
  across a reload, and the multi-engine note. The server keeps the rates with the profile.
- **In Edge**, as a guest: the price at 390, 360 and 320 px wide and on a desktop, light and dark,
  with no sideways scroll and the table inside its panel. With Waterloo Wellington's rates
  ($235 with the surcharge, $92, simulator $135): PPL about $15,400, IFR Group 3 about $25,800
  with 20 h in the simulator.

## Phase 17: the price card, after a look at it live (2026-11-05)

**Owner request.** Check the live page as a pilot would, and change what needs it.

**Seen live**, as a guest from an empty log and part-way (20 h dual, 6 h solo: $6,000 left, and
$13,100 at 65 h): the price followed the logbook, the arithmetic was there to check, and the
rates were kept. Two things didn't work for a student budgeting:
1. The card said "about $14,500", which reads as the likely cost. It is the least: at the 65 h
   most students fly it is about $21,500, and that figure was only in the closed panel.
2. The rates were in that panel too, under "How the cost is worked out", where a pilot looking for
   them might not open it.

**Changed** (D39):
- The card says "left to pay, at least", like the hours beside it, rounded down so it never tops
  the panel's total. Under it, for the PPL: "About $21,500 at the 65 h average".
- While the rates are the sample ones, the card says "At sample rates. Enter your school's rates".
  The link opens the panel with the cursor in the aeroplane's box, and goes once a rate is typed.

**Checked:** the screen test now follows the link and checks the panel opens on the aeroplane's
box, and the link goes and comes back with the rates; a test for rounding down. In Edge on a phone
(390, 360, 320 px) and a desktop (1280, 1024, 800 px), light and dark: no sideways scroll, the box
in view and typed into after the link.

## Phase 18: finish date (2026-11-05)

**Owner request.** The next feature: "At your pace (2.4 h a week) you'll reach the PPL minimum
around March."

**Built** (D40):
- `src/rules/pace.ts`: the flight and FTD time logged a week over the last 8 weeks, from flights
  logged one by one (after the latest paper totals, or from the first flight), over 14 days at
  least and with two flights at least; the day a goal's time left is flown at it; the month.
- The time left is the plan the price is for, so the date and the price agree. The PPL's 65 h
  average moved from the cost panel into the rules (`toAverage`), so both use it.
- Under the hours and the price: "At your pace, 1.3 h a week, you'll reach the minimum around June
  2027, and the 65 h average around September 2027", then where the pace comes from. With fewer
  than two flights lately: "A finish date needs two flights logged in the last 8 weeks."

**Problem on the way:** the screen test's student flew weekly from September 17, and the app said
1.3 h a week where the test expected 1.2. The app was right: with no flight before the 8 weeks,
September 17 was the first flight, and the pace is measured from it, over 50 days. The test now
has the student flying before the 8 weeks, which is what it meant to check.

**Checked:**
- 9 new tests: the 8 weeks, a new student's first two weeks, paper totals never counting and the
  pace starting after them, FTD counting, no pace after 8 weeks without flying, the date and its
  month, nothing past five years, the 65 h average, and the screen from a fixed date, then months
  later with no flying.
- **In Edge**, as a guest logging three flights in the app: one flight asks for a second; three
  give 1.3 h a week and June 2027. Night February 2027, CPL August 2029, IFR Group 3 February 2028,
  ATPL "more than 5 years away", multi-engine no line. A phone at 390, 360 and 320 px and a
  desktop, light and dark, with no sideways scroll and no page errors.

## Phase 19: offline (2026-11-08)

**Owner request.** Three things to build, offline logging first: pilots often have no signal at the
airport, and the riskiest part is one logbook edited on two devices while offline.

**Built** (D41):
- `src/sw.js`, a service worker: the build writes in every file of that version, so the whole app is
  stored at install and replaced whole. Pages from the network within 4 s, else the copy; built
  files from the copy; the API never touched.
- `src/model/sync.ts`: signed in, a copy on the device of the server's logbook and the changes it
  doesn't have yet. A profile change is what changed, field by field and item by item.
- `useLogbook` keeps each change before sending it, and sends them oldest first, one run at a
  time. Unreachable or a 5xx leaves them waiting; a 4xx drops the one refused and says so; a 401
  leaves them for signing in again. Opening with a copy shows it at once.
- The top bar says Saved, Saving… or Offline, and a note says how many changes are kept. Signing out
  sends what's waiting first, or refuses. The privacy page says what stays on the device.

**Problems on the way:**
1. *The worker's list had no pages.* Vite adds the HTML to the bundle after ordinary plugins run, so
   the first build listed only scripts and fonts and the app wouldn't have opened offline. The
   plugin now runs last, and the Pages workflow checks that `sw.js` was built.
2. *"Your change is kept… and go".* Edge showed the note reading wrong in the singular.
3. *A longer badge moved the top bar.* "Offline · 3 changes to save" wrapped the app's name at 800 px
   wide. It says "Offline · 3 to save" now, no wider than "Saved to your profile"; the full
   sentence is in its label.

**Checked:**
- 10 new tests: a profile change landing on a profile another device changed; the copy kept per
  address, and unreadable storage. On the screen, with a server that drops off and comes back: a
  flight kept and sent; the app reopened with no connection, on the pilot's own logbook, and its
  change put on top of the laptop's; a refused change; signing out with changes waiting; a
  session ending with changes waiting, and signing in again.
- **In Edge**, with the browser's own offline switch, the built page and a real API: signed up on
  a phone, logged a flight; offline, logged another, reloaded the page, and both were there with
  "Offline" in the top bar; the privacy page opened too; back online the change went by itself
  (2 lines on the server, none waiting). Light and dark, 800 and 1280 px.

## Phase 20: watching the standard (2026-11-08)

**Owner request.** A nightly job that compares the app's citations with Transport Canada's page
and says when one changes.

**Checked first.** The page fetches, with an honest user agent, at 371 KB. It has a heading with an
id for each section and marks amendments in the text. The owner's note said 68 citations; walking
`goals.ts` gives 74 distinct ones, used 126 times, so the watcher reads them from there.

**Built** (D42):
- `scripts/standard.ts`: reads the page into sections and numbered subsections, keeps the 10 sections
  the app cites, compares them with `scripts/standard-421.json`, and writes the alert.
- `.github/workflows/standard.yml`: every night; one issue, updated only if the page changes again.
  It also runs on a pull request that touches the citations or the watcher, so it proves itself
  against the real page from GitHub's machines.

**Checked:**
- 8 new tests: reading a page, a citation down to its paragraphs, a missing one reported, a change
  and its alert, a vanished section failing loudly, and every citation in the app against the stored
  copy. All 74 are on Transport Canada's page.
- **Against the real page**, with a stored line altered from 45 hours to 40: the alert named
  421.26(4), listed the seven PPL requirements resting on it, and showed the line. Restored, it says
  no change.

## Phase 21: the next flight (2026-11-08)

**Owner request.** A planner that picks the next flight closing the most requirements, since one
flight can count toward several. The instructor's questions are still open, so the owner asked for
it with a clear note that the instructor decides.

**Built** (D43):
- `src/rules/next.ts`: each kind of flight is added to the log and the real rules are run on it,
  so it has no rules of its own. It ranks by how much closer the goal gets, then requirements
  counted toward, then those finished, minutes and price.
- A card under the price: the flight, what it costs, each requirement with its before and after, a
  tick-off it could also be, up to two others, and that the instructor decides.
- `flatten` and `PILOT_LICENCE` are exported for it.

**Problems on the way:**
1. *On the numbers alone, a first-lesson student would be told to fly a solo cross-country.* The
   standard has no order, schools do. Nothing is suggested before a solo or a licence, and solo
   cross-country and solo night wait for their dual time.
2. *The check for double counting missed a case.* "Takes off no more than it lasts" only catches a
   flight mixing hood and cross-country on the CPL while the instrument time is what limits the plan.
   The standard says that time is on top of the cross-country at any stage, so the mixed flight
   is now offered only for the PPL and IFR, and the check stays as a backstop.

**Checked:**
- 13 new tests: before the first solo, what a flight counts toward, the order held back, flights that
  no longer help, flights another does as well, the night rating and its landings, the CPL's
  double counting, the FTD rate, nothing to suggest, every suggestion for every goal staying
  within its length, the usual length, and the card on the screen.
- **In Edge**, as a guest logging flights in the app: before a solo it says the school sets the order;
  after one, the mixed cross-country for 1.5 h and about $530, counting toward 4 requirements. A
  phone at 390, 360 and 320 px and a desktop, light and dark, no sideways scroll and no page errors.

## Phase 22: what runs out (2026-11-08)

**Owner request.** Start the next round with expiry checks; put every idea on the roadmap, all of it
wanted; and a great audit of the experience.

**Read first.** The 12-month flight-test window is in Standard 421, for the PPL, CPL, ATPL and the
night rating only. The written exams' 24 months isn't in it, so it comes from Transport Canada's
general information page, which the PPL study guide and application form agree with. A medical's
length depends on age, licence and flying (CAR 404.04), so the app takes the date from the
certificate rather than work it out. Reading 421.14(3) also turned up a requirement the app
didn't have: a recommendation for the flight test, dated within 30 days.

**Built** (D44):
- `validMonths` and `validUnless` on a dated requirement, and `until` and `stale` on its result.
  An exam, flight test, letter or medical past its last day isn't met, and what rests on it reopens.
- `medicalUntil` in the profile, and "Valid to" beside the medical on Progress and Profile.
- "Counts until…", in amber within 60 days, and a plain message once it has run out.
- The roadmap now has every list, in the order agreed, and a section for UI and UX.

**Checked:**
- 15 new tests: the months and days, every limit on its last day and the day after, an item with no
  date, a licence held lifting the limit, an expired exam reopening its gate and its letter, the
  medical holding up an exam, the date in the profile, and the screen.
- **In Edge**, as a guest on a phone at 390, 360 and 320 px and a desktop, light and dark: an
  expired medical and exam say so, and "Can you write the PPAER yet?" comes back. It showed "Valid
  to" wrapping onto two lines on a phone, now fixed.

## Phase 23: an audit of the experience (2026-11-08)

**Owner request.** "I feel like they're not good enough. I need a good, very great audit on how the
user experience can get better."

**How.** A reviewer who hadn't built the app, with no sight of the reasoning in `decisions.md` until
the findings were written, walked it in Edge as a new student, a student logging on the apron and a
licensed pilot, on a frozen copy with a throwaway database. It measured accessibility (axe-core),
tap targets, scroll heights, taps per flight, keyboard behaviour and speed on slow connections.

**Result** ([ux-audit.md](ux-audit.md)): correct and trustworthy, but it feels like filling in a
government form. 25 findings in six batches, now the UI and UX plan on the roadmap.

**Checked.** The worst claims were reproduced separately on the same build before being accepted, and
one detail about the dialog's focus was corrected. Nothing in it has been tried on a real phone, with
a screen reader, or with students yet, and it says so.

## Phase 24: the audit's first batch (2026-11-08)

**Owner request.** "Lets keep working and lets not stop working."

**Built** (D45): the entry form as a native dialog; asking before anything typed is thrown away, from
Cancel, Esc, a click outside or Back; a failed save taking the pilot to the problem; doubts about
impossible numbers; the logbook's table only above 1100 px, showing only the columns in use; one notice
at a time, with "Later" kept for two weeks; contrast; 44 px tap targets on phones; headings in order and
a page title per tab; a splash during the first load.

**Problems on the way:**
1. *Focus didn't come back to the button.* It was restored while the modal still made the page inert,
   so it fell to the body. It's restored after the modal has gone now.
2. *Tap sizes were overruled.* The phone rules came before each control's own size in the stylesheet, so
   they lost. They come last now.

**Checked.** 12 new tests. In Edge against the audit's own measures: the empty-Save error is on screen
(285 px, was 1,282) with the cursor in the box; Esc, a click outside and Back all ask; focus can't
leave the form and comes back to "Log a flight"; a route is never clipped from 720 to 1280 px;
no control under 44 px on a phone but the inline link to the standard; and axe finds nothing on the form,
the logbook, Profile or Progress in dark.

## Phase 25: logging a flight (2026-11-08)

The audit's second batch (D46): the quick form over the paper columns, the + on every tab with a
home-screen shortcut, the message after saving with Undo, deleting with Undo instead of a question, and
the sheet following the keyboard.

**Problem on the way:** the new button in the top bar pushed it wider than the screen from 721 to 880 px.
The + stays by the thumb up to 1000 px wide now.

**Checked.** 14 new tests. In Edge on a phone: an ordinary dual flight is 3 taps and 3 digits; "1.3 h
logged. PPL: 43.7 h to go, was 45.0."; the same flight appears in the paper columns; the bar fits at
every width; axe finds nothing on the quick form in light or dark. The keyboard behaviour can't be
checked without a real phone.

## Phase 26: Progress at a glance (2026-11-08)

The audit's third batch (D47): the ring and the hours first, one goal switcher, what's left with Done
folded, unlocked steps on one line each, Mark as held moved out of the way, and moments for a first solo,
half way and finishing.

**Checked.** 9 new tests. In Edge, for a mid-PPL student on a phone: Progress is 3.2 screens (was 4.8)
with the guest notice, and the first bar is at 1,225 px (was 2,592); axe finds nothing in dark on a
desktop; nothing spills sideways at 320 px. The audit asked for under two screens; the rest of the length
is requirements genuinely still open.

## Phase 27: a logbook that scales (2026-11-08)

The audit's fourth batch (D48), which also delivers the roadmap's search and filter: two-line rows you tap
to open, months with their totals, search, filters, plain words, and Delete in the form.

**Checked.** 7 new tests. In Edge with 340 flights: a row is 66 px on a phone (was 157), and the list is 28
screens (was 65); "crosswind" finds its 9 lines; the table on a desktop clips no route; axe finds nothing
on a tablet or in dark on a desktop; nothing spills sideways at 320 px.

## Phase 28: first run and trust (2026-11-08)

The audit's fifth batch (D49): a picture of the product on the welcome, both choices on a phone's first
screen, an empty logbook asking where the pilot is, how current the rules are beside them, our readings
labelled, the columns explained, account actions confirmed, a password that can be shown.

**Checked.** 10 new tests. In Edge on a phone: Create profile ends at 643 px and Continue without a profile
at 780, on an 844 px screen; axe finds nothing on the welcome or the first step; nothing spills sideways at
320 px.

## Phase 29: made for reading outdoors (2026-11-08)

The audit's last batch (D50): 16 px text and nothing under 14, stronger secondary text, the paper columns
as headed groups, "45 h" kept together, and motion that stops when a device asks for less.

**Problem on the way:** cleaning unused styles in the Progress batch cut a shared selector list in half, so
headings, buttons and tabs lost the display font. A screenshot of the form showed it. Only that rule was
damaged, checked against `main`.

**Checked.** In Edge on a phone (light and dark) and a desktop: the smallest text on Progress, the Logbook
and the paper columns is 14 px, axe finds nothing, nothing spills sideways. All six of the audit's batches
are done; what's left of it needs a real phone or real students.

## Phase 30: log it again, fly the suggestion, what the pace costs (2026-11-08)

Three small ways the app saves a step (D51): "Log again" starts a new form from any flight, "I flew this" opens
the form with the suggested flight filled in, and the finish date now says what that pace costs a month.

**Problem on the way:** going from one form straight into the next, the old form's `history.back()` undid the
new form's history entry, so the new one closed at once. It now waits for the `popstate` before opening.

## Phase 31: current to fly (2026-11-08)

For licensed pilots, a card at the top of Progress says whether they can still fly and carry passengers, from
CAR 401.05 read directly (D52). The roadmap had said "approaches and holds"; the regulation has no holds.

**Problem on the way:** the first version started the approaches a month early, counting six months from the
check instead of the seventh month after it. Reading the wording again before committing caught it, and there's
now a test on the boundary. No test had failed, because the dates in them fell on the right side either way.

## Phase 32: reminder emails (2026-11-08)

A switch on the Profile tab, off by default, sends an email 30 and 7 days before a medical, exam result, letter,
recurrent training or instrument check runs out (D53). The rules are the screen's own. A daily GitHub Actions run
wakes the server and calls it with a key. The owner sets that key once ([deploy.md](deploy.md), step 10).

**Problem on the way:** the switch only moved once the server had answered, so a tap seemed to do nothing. It now
shows what was asked for at once, and goes back if the server says no.

**Problem on the way:** the server's image only copied `src/model`, and reminders need `src/rules` too. Every test
passed, and the deploy would have failed. CI builds and starts the image on each push, which is what caught it.

**Checked.** In Edge against a local server: signed up, confirmed, turned it on, ran it, got the email, ran it
again and got nothing, stopped it from the link signed out, and the switch showed off. A wrong key gets a 401.

## Phase 33: a spreadsheet out and in (2026-11-08)

The logbook now exports as a CSV for Excel, and a pilot's own spreadsheet can come in (D54). It reads a column only
when the heading says exactly which one it is, and shows what it would add before adding anything.

**Checked.** In Edge on a phone, with a real download and a real file: the file has its byte-order mark and accents,
a formula in the remarks is defused, importing the same file again adds nothing, and someone's own spreadsheet with a
bad date and a 12-hour line reports both before anything is added. axe finds nothing on the preview.

## Phase 34: the logbook on paper (2026-11-08)

Every line in the paper log's columns, sideways, with each page's own totals carried forward (D55). The browser's
Save as PDF makes the file, so it costs nothing and nothing leaves the device.

**Problem on the way:** with a career's worth of hours, totals spilled out of their columns on Letter, though not on
A4, which is wider. The columns are a little wider now, and a long number prints smaller rather than being cut.

**Checked.** Real PDFs from Edge on Letter and A4, with 81 lines including 12,345 hours brought forward: 4 pages plus
the remarks page, as counted, no number outside its cell, and axe finds nothing. Not printed on paper.

## Phase 35: a read-only link for an instructor (2026-11-09)

A pilot can make a link that shows an instructor where they stand, with no profile needed to open it (D56). Only
figures leave the server, never logbook lines, marks or dates.

**Checked.** In Edge, on a local server: a pilot made a link, and a browser with no cookies opened it. The response
had no registration, remark, airport, date or email in it. The link survived a reload, stopped working the moment the
pilot stopped sharing, and axe finds nothing on either screen.

## Phase 36: checked on the live site (2026-11-09)

With #15 to #26 merged, CI and the Pages deploy passed on `main`, and the API answers on its new routes, so its two
database steps ran. In Edge on a phone, as a guest on the real site: the welcome, logging a flight, log again, the
ring, Current to fly, printing, both ways of the spreadsheet, dead instructor and reminder links, and opening with no
connection all worked. Nothing signed in: that needs a real account on the production database.

**Problem found:** the print screen had no main landmark, which a scan of the whole page shows and the earlier scan of
just its contents couldn't. Fixed. The only other thing axe reported was the toast's text during its 0.22 s fade-in.

## Phase 37: French (2026-11-09)

The whole app in Canadian French: every screen, the requirements, the server's messages, the emails and the privacy
page (D57). About 800 phrases, with the aviation terms taken from Transport Canada's French Standard 421. The owner
chose to ship it as a best effort and correct it from reviews.

**Problems on the way:** the French medical picker was wider than a small phone, so the page scrolled sideways, and
two kinds of text were missed at first: hints passed as props, and English plurals in code. A test now fails if text
on a screen doesn't go through `t`, and it found one more hint the moment it was written. An independent review
against the French Standard found no error in any number, limit or condition, and 35 things to change, each checked
against the text: mostly its terms (Transports Canada, formation en vol, contrôle de compétence pilote) and short goal
names that weren't translated.

**Checked.** In Edge on a 360 px phone with the browser set to French: every screen is in French, no placeholder
shows, nothing scrolls sideways, and axe finds nothing. Emails are tested in both languages. No French speaker has
read it yet.

## Phase 38: what if you flew more or less (2026-11-09)

A slider under the finish date moves it, and the monthly cost, for any pace from half an hour to 15 hours a week (D58).

**Checked.** In Edge on a phone in both languages, by keyboard as well as touch; axe finds nothing.

## Phase 39: the flight clock (2026-11-09)

Start it before a flight, tap Landed after, and the form opens with the time filled in (D59). It keeps only the moment
it started, so it runs on with the app closed.

**Checked.** In Edge on a phone in both languages, with a real reload in the middle of a flight, through to a saved
line; axe finds nothing on the bar. The home-screen shortcut needs a real phone.

## Phase 40: the route (2026-11-09)

The goal drawn as a flight plan under the ring: one leg for each part of the standard, and an aircraft on the leg in
progress (D60).

**Checked.** In Edge on a 360 px phone, light in English and dark in French; axe finds nothing.

## Where things stand

- 409 tests pass (rules 37, cost to go 16, finish date 8, next flight 12, expiry 14, logbook model
  21, offline changes 5, server API 42, the standard's watcher 8, first visit, guest, cost to go,
  finish date, next flight, expiry, password reset, confirm links and feedback 28, the form and
  notices 12, the quick form 14, Progress 9, the logbook 7, first run and trust 10, signed in 6,
  offline on the screen 5, log again and the cost a month 4, current to fly 17, reminders 21, the spreadsheet 19, the paper log 13, the instructor link 20, French 27, the what-if slider 7, the flight clock 16, the route 10), and the API tests per
  database also run against a Postgres server through `pg` in CI.
- Typecheck clean on both configs; `npm audit` clean.
- Live at <https://nberkyilmaz.com/hours-to-go/>, API at `https://hours-to-go-api.nberkyilmaz.com`.
- Password reset live. Feedback and error alerts send once `FEEDBACK_TO` is set in Render, and reminders once
  `REMINDERS_KEY` is set in Render and GitHub. Backups
  run once the private repository exists and has its `DATABASE_URL` secret.
- What comes next, in order, is the plan in [roadmap.md](roadmap.md).
