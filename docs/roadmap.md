# Roadmap

Live at <https://nberkyilmaz.com/hours-to-go/> since 2026-10-28.

## The plan to going public (agreed with the owner on 2026-10-29)

The owner wants the app finished and polished before it is advertised, with no gaps, and nothing
that costs money until it has users: no paid plan, no domain of its own, no store accounts yet
(D32). Each step is a pull request the owner merges. Paid items wait under
[Later, once it has users](#later-once-it-has-users).

### 1. Fix first

1. ~~**Backups.**~~ Done: a nightly copy in a private repository, restored into an empty Postgres
   as a test every night, kept 90 days (D29). Needs the owner once: the private repository's
   `DATABASE_URL` secret ([deploy.md](deploy.md), step 8).
2. ~~**A privacy and terms page.**~~ Done: `/hours-to-go/privacy/`, linked from the welcome screen
   and Profile (D30). It needs updating whenever what's stored or who stores it changes.
3. ~~**A way to reach the owner.**~~ Done: "Send feedback" on the Profile tab and the privacy
   page, emailed to the owner through Resend with the pilot's address to reply to (D31). Needs the
   owner once: `FEEDBACK_TO` in Render ([deploy.md](deploy.md), step 6).

### 2. The rest of the gaps (all free)

1. ~~**Migrations.**~~ Done: numbered steps, each run once at start-up (D33).
2. ~~**Confirm email, gently.**~~ Done: a link on sign-up, a banner and a Profile notice until
   it's opened, and nothing blocked (D34).
3. ~~**Change email and change password**~~ while signed in. Done: a new address takes over once
   its link is opened; a new password signs out other devices (D35).
4. ~~**Sign-up protection.**~~ Done: 20 sign-ups an hour from one network (D36).
5. **Error alerts.** The server emails the owner, through Resend and at most a few an hour, when
   something fails that the pilot didn't cause. No new service.
6. **Link previews.** `og:` tags and a preview image, so a shared link shows a picture and a line
   in group chats, Instagram and Facebook.
7. **An instructor checks the numbers.** The four questions under
   [Confirm with the flight school](#confirm-with-the-flight-school), and a run through the app
   with a real student's logbook.
8. **Settings for the owner, free:**
   - Render → hours-to-go-api → Settings → Build & Deploy → Auto-Deploy → "After CI checks
     pass", and `autoDeployTrigger: checksPass` in `render.yaml`, so a push that fails CI never
     reaches pilots.
   - Verify `nberkyilmaz.com` on the GitHub account (Settings → Pages → Add a domain, a TXT
     record at Cloudflare), so no other account can claim it or a subdomain.
   - Retake the landing page's screenshot (`assets/hours-to-go.webp` in the user site), which
     shows the look before 2026-10-28.
9. **The masthead on a phone, signed in.** "HOURS TO GO" breaks onto two lines beside "Saved to
   your profile" at 390 px wide. Shorten the badge on narrow screens.
10. **`@fastify/static` advisories** (path traversal and route-guard bypass, fixed in 10.x). The
   published API never registers it, because it has no `dist/`. Upgrade before anyone uses the
   one-process setup in public.

### 3. Features, all before going public

The owner wants every one of these. Roughly in order of value:

1. **Cost to go.** The pilot enters their school's aircraft and instructor rates; the app shows
   "about $8,400 to go" next to the hours. Money is a student's biggest worry, and it's the line
   the advertising can lead with.
2. **Finish date.** "At your pace (2.4 h a week) you'll reach the PPL minimum around March",
   from the last few weeks of flying.
3. **Email reminders**, opted into: medical expiry (needs the expiry date in the profile), the
   recommendation letter's 60 days, written exam results expiring before the flight test, IFR
   renewal. Render's free server sleeps, so a daily GitHub Actions run would wake it to send them.
4. **Currency and recency** (401.05) for licensed pilots: 5 takeoffs and landings in 6 months to
   carry passengers, night currency, IFR currency (6 approaches and holds in 6 months; the
   approaches column already exists). It keeps pilots using the app after their licence.
5. **Offline logging while signed in.** Today, without a connection the app falls back to this
   device's guest log and offers to merge it later. A service worker plus a queue of unsent
   changes would let a pilot log at the airport with no signal. The phone apps need it too.
6. **"Log again"**: copy an earlier flight. Students fly the same lesson many times. (The form
   already starts from the last aircraft, registration and departure.)
7. **Search and filter** the logbook by date, aircraft type and registration; the list grows to
   hundreds of lines.
8. **Spreadsheet export and import (CSV).** Today's export is JSON only this app reads. A CSV
   opens in Excel, and importing one lets pilots move from their own spreadsheets.
9. **Print or PDF** in paper-log layout, for an examiner or the school.
10. **Share progress with an instructor** through a read-only link. Later it could bring in whole
    flight schools.
11. **French.** Quebec trains a large share of Canada's pilots, and Transport Canada publishes in
    both languages.

Also wanted some day, if pilots ask: PIC under supervision for the ATPL; Group 2 and Group 4
instrument ratings, helicopters; other authorities (a second `goals` file and an authority setting
in the profile); instructor sign-off on milestones (today the pilot ticks them).

### 4. Going public

1. **A small test first**: 10–15 classmates and students at the owner's school use it for 2–3
   weeks, and what they find gets fixed. The same people can later be Google Play's 12 testers.
2. **Then advertise**: flight schools, pilot groups, social media.

### Later, once it has users

These cost money, so they wait (D32):

- **A domain of its own** (for example `hourstogo.ca`) and a support address on it. The page, the
  API, the emails and the privacy page all move, and the API must stay same-site with the page
  (D25). Best done before the store listings, which carry the URLs.
- **Render Starter, $7/month**, so the server never sleeps and nobody waits up to a minute.
- **Phone apps in the App Store and Google Play.** Capacitor packages this web app for both.
  - Apple Developer Program US$99/year.
  - Google Play US$25 once. New personal accounts must run a closed test with 12 testers for
    14 days before going public.
  - The apps sign in with a token in the phone's secure storage, since iOS blocks the cookie the
    website uses from an API on another domain.
  - Offline logging (feature 5) first, which Apple also expects of an app that isn't just a website.
  - iPhone builds on GitHub's macOS runners, free for a public repository; testing through TestFlight.

## Confirm with the flight school

These are interpretations the app shows in its notes; the owner's FTU can settle them:
- Does FTD dual count toward the IFR 15 h dual instrument flight time? (App: no.)
- Does PPL hood time count toward the night rating's 10 h dual instrument? (App: yes.)
- Is the CPL's 30 h "solo" strictly alone on board? (App: yes.)
- Do night-rating and IFR dual after the PPL count as CPL "commercial flight training"? (App: yes,
  everything after the PPL issue date counts.)

The logbook-photo import was dropped by the owner (decision D24); pilots type their totals in.

## Known limits

- Night and instrument time inside one line can't be told apart, so the night rating's "instrument
  on top of night" isn't checked.
- Paper totals can't show which landings were solo; the form asks only for night landings, because
  that is all the rules need.
- Co-pilot cross-country isn't a column, so the ATPL's co-pilot alternative isn't counted.
- Age, medical expiry, written-exam validity windows and flight-test 12-month windows aren't checked.
  The exam checklist asks for the right medical category but not its expiry date.
- Resend's free plan sends 100 emails a day. Links to confirm an address are capped at 50 a day
  so reset links keep room; past that, a new profile's link waits for "Send a new link".
- The limits on sign-ins, sign-ups, reset and confirm emails, and feedback are in memory, so they
  reset on restart and don't work across several servers. On Render's free plan they also reset
  every time the service sleeps.
- No service worker: the home-screen app needs a connection to open.
- On the free plan the API sleeps. A signed-in pilot opening the app can wait up to a minute (D26).
- Safari keeps the session cookie only 7 days (D25). The app renews it on every open, so this
  matters only to a pilot who hasn't opened it for a week.
- Backups are nightly, so a restore from one loses up to a day. Neon's own point-in-time restore
  covers only a short recent window on the free plan.
