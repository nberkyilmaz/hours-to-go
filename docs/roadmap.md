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
5. ~~**Error alerts.**~~ Done: the owner gets an email, at most 5 an hour, and the pilot a plain
   sentence (D37).
6. ~~**Link previews.**~~ Done: `og:` tags and a 1200 × 630 picture, `public/og.png` (D38).
7. **An instructor checks the numbers.** The four questions under
   [Confirm with the flight school](#confirm-with-the-flight-school), and a run through the app
   with a real student's logbook.
8. **Settings for the owner, free:**
   - ~~`autoDeployTrigger: checksPass` in `render.yaml`~~ (done), so a push that fails CI never
     reaches pilots. After it is merged, check that Render → hours-to-go-api → Settings → Build &
     Deploy → Auto-Deploy says "After CI checks pass"; if not, choose it there.
   - Verify `nberkyilmaz.com` on the GitHub account (Settings → Pages → Add a domain, a TXT
     record at Cloudflare), so no other account can claim it or a subdomain.
   - Retake the landing page's screenshot (`assets/hours-to-go.webp` in the user site), which
     shows the look before 2026-10-28.
9. ~~**The masthead on a phone, signed in.**~~ Done: the badge says "Saved" on a phone, so the
   name stays on one line down to 320 px.
10. ~~**`@fastify/static` advisories.**~~ Done: 10.1.8, with `glob` held at its fixed 14.x, and
   Vitest 5 and Vite 6.4.5 for the advisories in the test and build tools. `npm audit` finds none.
11. ~~**Notice when Transport Canada changes the standard.**~~ Done: a nightly check of every section
   the app cites, and a GitHub issue naming what changed and which requirements rest on it (D42).

### 3. Features, all before going public

The owner wants every one of these. Roughly in order of value:

1. ~~**Cost to go.**~~ Done: each goal shows what its least flying costs at the school's rates
   (sample rates until the pilot enters their own), next to the hours, with the arithmetic
   (D39). Money is a student's biggest worry, and it's the line the advertising can lead with.
2. ~~**Finish date.**~~ Done: "At your pace, 1.3 h a week, you'll reach the minimum around June
   2027", from the flights and FTD sessions of the last 8 weeks, for the time the price is for
   (D40).
3. ~~**Email reminders**~~ Done (D53): turned on from the Profile tab, 30 and 7 days before a medical, exam
   result, letter, recurrent training or instrument check runs out. A daily GitHub Actions run wakes the server.
4. ~~**Currency and recency**~~ Done (D52): for licensed pilots, the 5 years, recurrent training, passengers
   by day and at night, and the instrument check and approaches, from CAR 401.05.
5. ~~**Offline logging while signed in.**~~ Done: a service worker keeps the app on the device, and
   changes are kept there until the server has them, so a pilot can open it and log with no signal
   (D41). The phone apps needed it too.
6. ~~**"Log again"**~~ Done (D51): any flight or FTD session can be flown again from its form.
7. ~~**Search and filter**~~ Done (D48): by date, aircraft, registration, airports and remarks, and by
   kind of time.
8. ~~**Spreadsheet export and import (CSV).**~~ Done (D54): opens in Excel, and a pilot's own spreadsheet comes in
   through a preview, as long as its headings say which column each one is.
9. ~~**Print or PDF**~~ Done (D55): every line in the paper log's columns, with each page's totals carried forward.
10. ~~**Share progress with an instructor**~~ Done (D56): a read-only link that shows figures, never logbook lines,
    for 30 days or until the pilot stops it. Later it could bring in whole flight schools.
11. ~~**French.**~~ Done (D57), as a best effort to be corrected from reviews. Quebec trains a large share of Canada's pilots, and Transport Canada publishes in
    both languages.
12. ~~**Next flight.**~~ Done: which flight counts toward the most of what is left, tried against
    the real rules, with a note that the instructor decides (D43).
13. ~~**Expiry checks.**~~ Done: a written exam counts for 24 months, a flight test for 12 where the
    standard says so, the medical to its valid-to date, and the flight test needs its 30-day letter
    (D44).
14. ~~**Cost per month at your pace.**~~ Done (D51): under the finish date.
15. ~~**Small fixes.**~~ Done: "45 h" no longer splits across lines (D50).

**The order from here** (agreed with the owner on 2026-11-08, who wants all of it): the four ideas below (a what-if pace slider, a "Landed" timer, training drawn as a flight plan, shareable milestone cards). The small fixes go in with whatever
touches them.

Also wanted some day, if pilots ask: PIC under supervision for the ATPL; Group 2 and Group 4
instrument ratings, helicopters; other authorities (a second `goals` file and an authority setting
in the profile); instructor sign-off on milestones (today the pilot ticks them).

### UI and UX

The owner isn't happy with how it looks and feels yet, and wants it much better before going
public. [ux-audit.md](ux-audit.md) is a full audit by a reviewer who didn't build it, measured in a
real browser on a phone. Its verdict: correct and trustworthy, but it feels like filling in a
government form. The batches, with its finding numbers:

- ~~**A. Stop the bleeding.**~~ Done (D45): errors the pilot can see (F4), a typed flight can't be
  lost (F6), impossible numbers questioned (F7), the logbook at tablet widths (F9), one slim banner at
  a time (F13), the dialog's keyboard behaviour (F19), contrast (F20), tap targets (F21), and the small
  things that were quick (F25).
- ~~**B. The flight.**~~ Done (D46): a quick form on top of the paper columns (F1), a + on every tab
  (F2), a "logged" moment with Undo (F3), and the sheet following the keyboard (F8, to confirm on a
  real phone).
- ~~**C. Progress at a glance.**~~ Done (D47): a ring first and a short "what's left" list (F5),
  achievements (F16), one goal switcher (F17), the price's sample rates said out loud (F14).
- ~~**D. A logbook that scales.**~~ Done (D48): compact rows, month headers, search and filter (F10,
  and feature 7 above), plain words on the rows (F15).
- ~~**E. First run and trust.**~~ Done (D49): show the product before asking for a password (F11), ask
  who the pilot is (F12), explain the terms (F15), put the trust details by the numbers (F18), and
  say what happened after account actions (F24).
- ~~**F. Finish.**~~ Done (D50): legibility in sun (F22), and a visual pass across it all (F23).

A and B come before the trial with students. These collide with recorded decisions, so each needs
its decision updated when it's built: F1 with D6 and D10, F5 with D18, F11 with D27.

**Then, to make it excellent** (the owner wants these too):
- **A "Landed" shortcut**: long-press the icon and log with one number, or a timer.
- ~~**"I flew this"**~~ Done (D51): on Your next flight, opening the form already filled in.
- **Training drawn as a flight plan**, with waypoints: first solo, written exam, flight test.
- **A what-if slider for pace**: "twice a week: done by February, about $X".
- **Shareable milestone cards**: "First solo at 14.2 h".

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
  - Offline logging (feature 5, done), which Apple also expects of an app that isn't just a website.
  - iPhone builds on GitHub's macOS runners, free for a public repository; testing through TestFlight.

## Confirm with the flight school

These are interpretations the app shows in its notes; the owner's FTU can settle them:
- Will an examiner or the school accept a printed logbook from the app? (App: says to ask.)
- CAR 401.05(3.1): do approaches flown before the first day of the seventh month after an instrument check count
  toward the six? (App: yes, if they're within the six months, D52.)
- Does FTD dual count toward the IFR 15 h dual instrument flight time? (App: no.)
- Does PPL hood time count toward the night rating's 10 h dual instrument? (App: yes.)
- Is the CPL's 30 h "solo" strictly alone on board? (App: yes.)
- Do night-rating and IFR dual after the PPL count as CPL "commercial flight training"? (App: yes,
  everything after the PPL issue date counts.)
- For the cost to go (D39): are the hours past the PPL's 17 h dual and 12 h solo mostly dual, and
  does the school charge GST/HST on CPL and IFR training up to the minimum hours?
- For expiry (D44): once an instrument rating is held, does the INRAT still have to be within 24
  months for the ATPL? (App: no.) Do the IFR, VFR OTT and Class 4 flight tests have a 12-month limit?
  (App: no, as the standard states none.)
- For the next flight (D43): does the order it assumes match the school's: nothing suggested before
  the first solo, solo cross-country after 3 h of dual cross-country, solo night after 5 h of dual
  at night? And can a PPL student's hood time on a dual cross-country count toward both?

The logbook-photo import was dropped by the owner (decision D24); pilots type their totals in.

## Known limits

- Night and instrument time inside one line can't be told apart, so the night rating's "instrument
  on top of night" isn't checked.
- Paper totals can't show which landings were solo; the form asks only for night landings, because
  that is all the rules need.
- Co-pilot cross-country isn't a column, so the ATPL's co-pilot alternative isn't counted.
- Age isn't checked. A dated item with no date can't be checked. The app keeps one valid-to date for
  the medical, though a Category 1 lasts longer for private flying (CAR 404.04), so the pilot enters
  the date for the flying they do (D44).
- Resend's free plan sends 100 emails a day. Links to confirm an address are capped at 50 a day
  so reset links keep room; past that, a new profile's link waits for "Send a new link".
- The limits on sign-ins, sign-ups, reset and confirm emails, and feedback are in memory, so they
  reset on restart and don't work across several servers. On Render's free plan they also reset
  every time the service sleeps.
- The cost to go prices the flying only: not ground school, briefings, exam and flight-test fees,
  the medical or the licence. It takes one aeroplane rate, so a Group 1 IFR flown partly in a twin
  is priced as a single.
- Offline, importing a file, moving guest entries into a profile and account changes need the
  server. If one line is edited on two devices while offline, the last to reach the server wins (D41).
  Safari can clear a website's storage after 7 days without a visit, changes still waiting included,
  unless the app is on the home screen.
- On the free plan the API sleeps. A signed-in pilot opening the app can wait up to a minute (D26).
- Safari keeps the session cookie only 7 days (D25). The app renews it on every open, so this
  matters only to a pilot who hasn't opened it for a week.
- Backups are nightly, so a restore from one loses up to a day. Neon's own point-in-time restore
  covers only a short recent window on the free plan.
