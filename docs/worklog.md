# Worklog

Everything below happened on 2026-10-20, in this order. Each phase says what was asked for,
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

## Where things stand

- 78 tests pass (rules 37, logbook model 21, server API 11, app as guest 7, app signed in 2).
- Typecheck clean on both configs.
- First commit pushed to <https://github.com/nberkyilmaz/hours-to-go> (public).
- Nothing deployed; SQLite needs a persistent disk before real use; password reset not built.
