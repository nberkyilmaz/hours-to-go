# Hours to Go

A pilot logbook that tells you what is left for each Transport Canada licence and rating.

Each logbook line has the same columns as a Canadian pilot's personal log: single- and
multi-engine time by day and night (dual, PIC, co-pilot), cross-country day and night (dual, PIC),
actual IMC, hood, FTD, IFR approaches, and day and night takeoffs and landings. Paper totals go in
the same boxes, one line per aircraft type if you want totals by type. For every licence and
rating the app shows each requirement, how much you have, how much is left, what is unlocked
(writing the exam, booking the flight test), and the paragraph of the standard it comes from.

It runs in a browser on a computer or a phone, and can be added to a phone's home screen.
Without an account the logbook is saved in that browser only. With a free profile (email and
password) it is saved on the server and is the same on every device. Anything logged before
signing up moves into the new profile.

## Licences and ratings covered

All from [CAR Standard 421](https://tc.canada.ca/en/corporate-services/acts-regulations/list-regulations/canadian-aviation-regulations-sor-96-433/standards/standard-421-flight-crew-permits-licences-ratings-canadian-aviation-regulations-cars),
aeroplane category, text current to NSA 2025-008 (effective 2025-12-17).

| Goal | Standard | Written exam unlocks | Flight test unlocks |
| --- | --- | --- | --- |
| Private Pilot Licence | 421.26 | Cat 3 medical, ground school, letter, 5 h flight time | 35 of the 45 h training (421.14(4)(a)) |
| Night Rating | 421.42(1) | — | — |
| VFR Over-the-Top | 421.44 | — | — |
| Commercial Pilot Licence | 421.30 | Cat 1 medical, ground school, letter, 50 h (25% of 200 h) | 150 h, 75% of 200 h, and CPAER passed (421.14) |
| Multi-engine Class Rating | 421.38(3) | — | — |
| Instrument Rating Group 3 and Group 1 | 421.46 | Cat 3 or 1 medical, 5 h instrument flight or ground time | Every knowledge and experience item (421.14(4)(d)) |
| Flight Instructor Class 4 | 421.69 | Cat 1 medical, ground school, letter, 25% of the 30 h training | Every knowledge and experience item |
| Airline Transport Pilot Licence | 421.34 | Cat 1 medical, 375 h (25% of 1500 h) | 1125 h, 75% of 1500 h |

Every written exam (PPAER, CPAER, INRAT, SAMRA, SARON, AIRAF) shows a "Can you write it yet?"
checklist from 421.13: the medical, the recommendation letter where one is needed (PPAER, CPAER,
AIRAF; dated within 60 days), the share of experience in the table above, and photo ID on the day.

The INRAT prerequisite was changed on 2024-10-10 to **5 hours of instrument flight or ground
time**. Older material and some schools still talk about needing half of the 40 hours first.

### Where the standard needed interpreting

Each of these choices is also shown as a note next to the requirement in the app.

- **Paper totals in one entry**: the "total to date" line goes in box for box, and a few questions
  cover what its columns can't show. *How much of your PIC time was solo?* (all, none, or some
  by day, night and cross-country), *how many of the night takeoffs & landings were solo?* when the
  totals also hold night dual, and, for a pilot who holds a PPL, *how much was flown after it?* (none,
  all, or a short breakdown). Nothing else is asked, because the night rating and IFR count every
  hour regardless of which course it was flown in.
- **Solo**: the personal log keeps solo time inside the PIC columns, but the PPL, night rating and
  CPL count solo separately. A single flight has a "Solo flight" tick box. Solo requirements that
  fall short say how much PIC time in the log isn't counted as solo.
- **Grand total** adds the ten flight-time columns only. Cross-country, actual IMC and hood are part
  of that same time, logged again. FTD time is instrument ground time and is never flight time.
- **Dual instrument time**: the log doesn't say whether instrument time was dual, so on each line it
  counts as dual up to that line's dual time. Hood time under a safety pilot on a PIC line is
  instrument time but not dual. FTD time is counted as given with an instructor.
- **CPL commercial training** (the 65 h: 35 dual and 30 solo) counts flights from the day your PPL
  was issued, and from paper totals only the part you said came after it. Totals that don't say
  are counted in full, with a note asking you to answer. You can move the start date for each pilot.
- **IFR 15 h dual instrument flight time** counts aeroplane time only. Simulator time already
  counts toward the 40 h as ground time (up to 20 h). Ask your FTU if they credit simulator dual here.
- **Night rating 10 h dual instrument** counts every dual instrument hour in the log, including
  PPL training. The standard says it must be on top of the 10 night hours.
- **Credits**: a night rating covers the CPL night items, an instrument rating covers the CPL
  20 h dual instrument and the whole VFR OTT, and INRAT passed once counts for Group 3, Group 1 and the ATPL.
- **ATPL (c)**: 100 h of PIC cross-country beyond the first 100 h. The standard also accepts co-pilot
  cross-country, but the personal log has no column for it, so it isn't counted.
- Lines saved by the first version of the app (one role per line) are moved into these columns when read.
- Not modelled yet: PIC under supervision (ATPL), helicopters and other categories, Group 2,
  foreign and military credits, recency.

This is a study and planning aid, not an official record. The certified personal log and
Transport Canada decide what counts.

## Project documents

[docs/](docs/README.md) holds the worklog (every phase, problem and fix), the design decisions and
their reasons, the architecture, the Standard 421 text as read, the runbook, and the roadmap.
Read them before changing anything.

## Running it

Needs Node 22.13 or newer (it uses Node's built-in SQLite).

```sh
npm install
npm run dev:api     # API on http://127.0.0.1:8787
npm run dev:web     # app on http://localhost:5173, /api is proxied to the API
```

To try it on your phone on the same Wi-Fi, run `npm run dev:web -- --host` and open the
"Network" address it prints.

Production is one process serving the API and the built app:

```sh
npm run build
NODE_ENV=production PORT=8787 npm start
```

| Variable | Default | |
| --- | --- | --- |
| `PORT` | 8787 | |
| `HOST` | 127.0.0.1, or 0.0.0.0 in production | |
| `DATABASE_PATH` | `data/hours-to-go.sqlite` | Accounts and logbooks. Back this file up. |
| `NODE_ENV` | | `production` marks the session cookie Secure, so serve over HTTPS. |

On a host whose disk is wiped on every deploy, `DATABASE_PATH` must point at a persistent disk,
or the profiles are lost.

## Tests

```sh
npm test            # requirement rules, logbook data, server API, and the app in jsdom
npm run typecheck
```

## How it is put together

- `src/rules/goals.ts`: every requirement, with its citation. This is the file to check against the standard.
- `src/rules/evaluate.ts`: turns a logbook into have / need / unlocked for each goal.
- `src/model/entry.ts`: the logbook line and its columns (times in whole minutes so totals are exact),
  and the figures each line contributes (`derive`).
- `src/model/store.ts`, `profile.ts`: the profile, file parsing, and merging a device's log into a profile.
- `src/useLogbook.ts`: where the logbook lives. Signed in, changes show at once and are saved in order;
  a failed save puts the server's copy back and says so. As a guest, changes go to localStorage.
- `server/`: Fastify API, scrypt password hashes, HttpOnly session cookies (90 days), SQLite.

## Not done yet

- **Password reset** needs an email service. Until then a forgotten password means a new profile,
  so "Export logbook" in Profile is worth doing now and then.
- Offline logging while signed in. Without a connection the app falls back to this device's
  logbook and offers to add it to the profile once back online.
- A native app-store app. The web app installs to the home screen instead.
