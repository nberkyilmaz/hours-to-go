# Roadmap

## Waiting on the owner

**Putting it live at <https://nberkyilmaz.com/hours-to-go/>.** The code, the Render blueprint and
the Pages workflow are ready; what is left needs the owner's accounts. In order, from
[deploy.md](deploy.md):

1. A Neon database, and its connection string.
2. The Render service from `render.yaml`, with that string as `DATABASE_URL`.
3. `hours-to-go-api.nberkyilmaz.com`: custom domain in Render, CNAME at Cloudflare (DNS only).
4. The domain on the user site `nberkyilmaz.github.io`: shared with departure-brief, prepared
   locally at `C:\Users\canada\Desktop\Dev\nberkyilmaz.github.io`, not on GitHub yet.
5. In this repository: Pages source "GitHub Actions", the `API_URL` variable, run the workflow.

The logbook-photo import was dropped by the owner (decision D24); pilots type their totals in.

### Confirm with the flight school
These are interpretations the app shows in its notes; the owner's FTU can settle them:
- Does FTD dual count toward the IFR 15 h dual instrument flight time? (App: no.)
- Does PPL hood time count toward the night rating's 10 h dual instrument? (App: yes.)
- Is the CPL's 30 h "solo" strictly alone on board? (App: yes.)
- Do night-rating and IFR dual after the PPL count as CPL "commercial flight training"? (App: yes,
  everything after the PPL issue date counts.)

## Before real students use it

1. ~~A database that survives deploys.~~ Done: Postgres on Neon (D14).
2. **Backups** of that database, and a tested restore. Neon's free plan keeps only a short restore
   window. A scheduled `pg_dump` needs somewhere private to put it: these are personal records,
   so not a public repository's artifacts.
3. **Password reset.** Needs an email provider. Until then a forgotten password means a new profile,
   which is why Export sits on the Profile screen.
4. ~~HTTPS and a domain.~~ Done in code: `nberkyilmaz.com/hours-to-go/` and
   `hours-to-go-api.nberkyilmaz.com`, certificates from GitHub and Render. Live once the owner's
   steps above are done.
5. **A privacy note and terms**: what is stored (email, logbook), where (Neon, AWS US East 2, Ohio,
   so in the United States), how to delete it (Profile → Delete my profile already removes everything).
6. **Rate limits beyond sign-in** if it's opened to the public (sign-ups, merges).
7. **Migrations.** The tables are made with `create table if not exists`. The first change to an
   existing table needs a migration step, before there is data to lose.
8. **`@fastify/static` advisories** (path traversal and route-guard bypass, fixed in 10.x). The
   published API never registers it, because it has no `dist/`. It matters only for the one-process
   setup; upgrade before using that in public.

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
- The sign-in throttle is in memory, so it resets on restart and doesn't work across several
  servers. On Render's free plan it also resets every time the service sleeps.
- No service worker: the home-screen app needs a connection to open.
- On the free plan the API sleeps. A signed-in pilot opening the app can wait up to a minute (D26).
- Safari keeps the session cookie only 7 days (D25). The app renews it on every open, so this
  matters only to a pilot who hasn't opened it for a week.
