# Roadmap

## Waiting on the owner

Nothing at the moment. The logbook-photo import was dropped by the owner (decision D24); pilots type
their totals in.

### Confirm with the flight school
These are interpretations the app shows in its notes; the owner's FTU can settle them:
- Does FTD dual count toward the IFR 15 h dual instrument flight time? (App: no.)
- Does PPL hood time count toward the night rating's 10 h dual instrument? (App: yes.)
- Is the CPL's 30 h "solo" strictly alone on board? (App: yes.)
- Do night-rating and IFR dual after the PPL count as CPL "commercial flight training"? (App: yes,
  everything after the PPL issue date counts.)

## Before real students use it

1. **First commit.** Nothing is committed yet.
2. **A database that survives deploys.** SQLite is a file; hosts with a wiped disk on each deploy
   would lose every profile. Either a persistent disk for `DATABASE_PATH`, or move `Store`
   (`server/db.ts`, the only SQL in the project) to Postgres. The owner prefers free tiers and wants
   monthly and yearly costs kept apart.
3. **Backups** of that database, and a tested restore.
4. **Password reset.** Needs an email provider. Until then a forgotten password means a new profile,
   which is why Export sits on the Profile screen.
5. **HTTPS and a domain.** The cookie is Secure in production. The owner's other project has an
   unbought domain; this one has none chosen.
6. **A privacy note and terms**: what is stored (email, logbook), where, how to delete it (Profile →
   Delete my profile already removes everything).
7. **Rate limits beyond sign-in** if it's opened to the public (sign-ups, merges).

## Next work, roughly in order of value

- **Offline logging while signed in.** Today, without a connection the app falls back to this
  device's guest log and offers to merge it later. A service worker plus a queue of unsent changes
  would let a pilot log at the airport with no signal.
- **Editing many lines at once / CSV import** for pilots with a spreadsheet log.
- **Currency and recency** (401.05): 5 takeoffs and landings in 6 months for passengers, night
  currency, IFR currency (6 approaches and holds in 6 months). The approaches column already exists.
- **Per-aircraft-type filter** on the logbook list (the by-type totals exist).
- **PIC under supervision** for the ATPL.
- **Group 2 and Group 4 instrument ratings, helicopters**, if anyone asks.
- **Other authorities** (the owner mentioned extending beyond Transport Canada later). The rule
  catalogue would be a second `goals` file and an authority setting in the profile.
- **Printing the logbook** in paper-log layout, for an examiner.
- **Instructor sign-off** on milestones (today the pilot ticks them).

## Known limits

- Night and instrument time inside one line can't be told apart, so the night rating's "instrument
  on top of night" isn't checked.
- Paper totals can't show which landings were solo; the form asks only for night landings, because
  that is all the rules need.
- Co-pilot cross-country isn't a column, so the ATPL's co-pilot alternative isn't counted.
- Age, medical expiry, written-exam validity windows and flight-test 12-month windows aren't checked.
  The exam checklist asks for the right medical category but not its expiry date.
- The sign-in throttle is in memory, so it resets on restart and doesn't work across several servers.
- `node:sqlite` is marked experimental in Node 22.
- No service worker: the home-screen app needs a connection to open.
