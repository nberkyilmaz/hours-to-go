# Decisions

Each entry says what was chosen, why, and what was turned down. If you are about to reverse one,
read its reasons first; most of them came from a problem that already happened once.

---

## Product

### D1. Transport Canada, aeroplanes only, for now
The owner trains in Canada and asked for Transport Canada first, other countries later. Helicopters,
gliders, Group 2 (centre-line thrust), foreign and military credits are left out. The rule
catalogue is shaped so a second authority could be a second catalogue, but nothing is built for it.

### D2. Rules come from the source text, with a citation on every line
Every requirement in `src/rules/goals.ts` carries its Standard 421 paragraph, and the app shows it.
Several numbers differed from what memory would have said (see the worklog). Never change a number
without re-reading the standard; [transport-canada-rules.md](transport-canada-rules.md) has the text
as read.

### D3. Interpretations are shown, not hidden
Where the standard is ambiguous, the choice is written in the requirement's note so the pilot sees
it, and listed in the root README. The safer reading is preferred: counting less is better than
telling a student they are ready when they aren't.

### D4. "Least flying left" is the largest shortfall, not a sum
One flight can count toward several requirements (a dual night cross-country counts for dual,
night, cross-country). Adding the shortfalls would overstate what is left. The summary says
"at least".

### D5. Exams, ground school, special flights and flight tests are tick-offs
The log can't show them. They are milestones with a date and, for exams, a mark. A mark under the
pass mark keeps the requirement open. Milestones are shared by key, so INRAT passed once counts for
Group 3, Group 1 and the ATPL.

### D23. Every written exam shows whether you can write it yet
421.13 sets the conditions to sit a written exam: medical, photo ID, a recommendation letter (PPAER,
CPAER, AIRAF only) dated within 60 days, and a share of the experience. One check per exam lives in
`EXAM_CHECKS` and drives both the "Write the …" card and the "Can you write the … yet?" checklist
under the exam, so the two can never disagree. Letters are tick-offs that expire after 60 days and
show as used once the exam is passed. Photo ID is a reminder, not a tick-off.

### D24. No photo import of paper logbooks
Considered (a hosted vision model reading the handwriting, checked by the pilot) and dropped by the
owner: typing the totals into the one-entry form is quick enough, and it avoids an API key, a
per-photo charge and sending logbook photos to a third party.

## Logbook model

### D6. A line has the paper personal log's columns (replaced one role per line)
The first model gave each line one role (dual, solo, PIC, co-pilot) and a night part. The owner
asked for their paper log's exact columns and for several aircraft types per pilot. The column model
matches what pilots copy from paper, lets one line hold dual and PIC (as a "total to date" line
does), and makes column totals comparable with the paper page. Old lines are converted on read.

### D7. Times are whole minutes
Sums of decimal hours drift (0.1 + 0.2). Minutes are exact. Input accepts `1.3` or `1:18`; display
is tenths. When editing, a time that isn't a whole tenth is shown as `h:mm` so re-saving never
rounds it away.

### D8. The grand total is the ten flight-time columns
Cross-country, actual IMC and hood are part of that same time, logged again. FTD time is instrument
ground time and never flight time (the ATPL standard says so explicitly).

### D9. Dual instrument time is inferred per line
The paper log doesn't say whether hood time was dual. On each line, instrument time counts as dual
up to that line's dual time (`dualInst = min(actual + hood, dual)`). Hood under a safety pilot on a
PIC-only line is instrument time but not dual. FTD time is assumed to be with an instructor.

### D10. Solo: a tick box on a flight, a question on paper totals
Transport Canada counts solo separately (PPL 12 h, night rating 5 h, CPL 30 h, and 10 solo night
takeoffs and landings twice), but the paper log keeps it inside PIC. History:

1. A Solo tick box per line, refused on lines with dual time. Paper totals could never be solo, so
   the owner saw 0 h solo night and 0 solo night landings with 3.5 h and 34 landings logged.
2. Tick box allowed on mixed lines, plus a "how many night landings were solo" box and hints.
   The owner found ticking and splitting into several lines inconvenient.
3. **Current:** a single flight keeps a "Solo flight" tick box. Paper totals ask once, "How much of
   your PIC time was solo?" (All / None / Some), and ask for solo night landings only when the
   totals also hold night dual (the paper log can't say which landings were solo). A solo
   requirement that falls short says how much PIC time isn't counted as solo.

Don't go back to requiring separate lines for solo time.

### D11. CPL training is "after the PPL", worked out per line
The CPL's 65 h of commercial training must come after the PPL is issued. Flights count by date.
Paper totals count by their answer to "How much did you fly after your PPL?" (None / All / Some with
a small breakdown), via `afterPplPart()`. Unanswered totals count in full, with a note on the CPL
page. Before this, a totals line dated today counted PPL training as CPL training. The start date
can be moved per goal (the "Count training from" box).

Turned down: asking how much dual was "PPL / night / CPL / IFR". The night rating and IFR count all
hours whatever course they were flown in, so only the after-PPL split changes any result.

### D12. Night rating instrument time counts all dual instrument time
The 10 h dual instrument for the night rating counts PPL hood time too; the note says to confirm with
the school. The standard says it must be on top of the 10 night hours; the app can't see overlap
inside a line, so the note says so.

## Accounts and storage

### D13. One server process, Fastify, same stack as the owner's other project
Serves `/api` and the built app, so cookies are first-party and there is no CORS. In development
Vite proxies `/api` to port 8787.

### D14. SQLite through `node:sqlite`, entries as rows
No native build step on Windows; nothing to install. Each entry is its own row so two devices
editing different flights don't collide; the profile is one row. The cost: the database is a file,
so the host needs a persistent disk (see the roadmap). The `Store` class is the only code that
touches SQL, so moving to Postgres is one file.

### D15. Email and password, sessions in an HttpOnly cookie
scrypt (N=16384, r=8, p=1, 64-byte key, parameters stored with the hash so they can be raised).
32-byte random token, only its SHA-256 stored, 90-day cookie (students shouldn't have to sign in on
their phone every week), SameSite=Lax, Secure in production. Failed sign-ins throttled per IP and
email in memory (fine for one process). Turned down: magic links and password reset by email until
there is an email provider.

### D16. Guest mode stays, and merging never deletes
A student can try the app without signing up. The guest log lives in localStorage under
`hours-to-go/v1`. On sign-up it moves into the new profile automatically. On sign-in, if the device
has guest entries, a banner offers to add them. Merging adds what is missing by id and the account
side wins on any conflict. Import from a file uses the same merge, so it can't destroy anything.

### D17. Changes show at once and save in order (replaced server-first)
Server-first made checkboxes lag on a phone and invited double taps. Now every change is applied
locally, then the server calls run one at a time in a queue, each built from the state the previous
one left. On failure the server's copy is reloaded and a banner says the change was not saved. If
the server is unreachable the banner stays up. A 401 returns the app to guest mode and says so.

## Interface

### D18. Three tabs: Progress, Logbook, Profile
Progress opens on the goal the pilot is "working on" (saved in the profile), with what is unlocked
(exam, flight test) at the top and every requirement below. Below that, a card per licence or rating.
On a phone the tabs are a bottom bar.

### D19. Buttons name the thing they act on
"Mark IFR Group 3 as held", not "I already hold this". The vague label made the owner think they had
to tell the IFR page they held a licence, and clicking it would have marked the wrong thing.

### D20. Paper totals are one entry with questions under the columns
See D10 and D11. Questions only appear when they apply (PIC time present, night dual present, PPL
held) and must be answered before saving, with a message next to the question.

### D21. Plain CSS with light and dark tokens
No UI library. Colour tokens on `:root`, dark values under `prefers-color-scheme: dark`. 44 px touch
targets, 16 px inputs.

## Process

### D22. Check the UI in a real browser, at phone size, before calling it done
jsdom tests can't see layout. Three real bugs were only found in Edge at 390×844: the tab bar at the
top, the unreachable Save button, and cut-off fields. See the runbook.
