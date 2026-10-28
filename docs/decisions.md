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
Vite proxies `/api` to port 8787. This still holds for development and for running it on one
machine; the published site splits page and API (D25).

### D14. Postgres: Neon in production, PGlite on a laptop and in tests (replaced SQLite)
Each entry is its own row so two devices editing different flights don't collide; the profile is
one row (`jsonb`). The first version used SQLite through `node:sqlite`: no native build on
Windows, nothing to install. But the database was a file, and free hosts wipe their disk on every
deploy (Render's free plan also on every sleep). A persistent disk only comes with a paid plan.

Now `Store` (still the only code that touches SQL) talks Postgres through a three-call interface:
`pg` for a server, PGlite for everything local. PGlite is Postgres compiled to WebAssembly, so
local development still installs nothing, and the tests run the same SQL as production rather than
a second dialect. Neon because its free plan doesn't expire (Render's free Postgres is deleted
after 30 days) and the owner's departure-brief uses it. CI runs the API tests on both PGlite and a
real Postgres server, because only the latter goes through `pg`.

Turned down: Turso (SQLite-compatible, would have kept the SQL as it was) for a second native
client and a second provider; a paid disk on Render ($7/month plus storage) for the cost; Cloudflare
D1 because the Workers free plan's CPU limit is far below one scrypt hash.

### D15. Email and password, sessions in an HttpOnly cookie
scrypt (N=16384, r=8, p=1, 64-byte key, parameters stored with the hash so they can be raised).
32-byte random token, only its SHA-256 stored, 90-day cookie (students shouldn't have to sign in on
their phone every week), SameSite=Lax, Secure in production. The 90 days start again each time the
app opens (`GET /api/me` extends the session and sets the cookie again), which also keeps Safari
from signing out an iPhone after 7 days (D25). Failed sign-ins throttled per IP and
email in memory (fine for one process). Turned down: magic links (sign in by email alone). A
forgotten password is reset by an emailed link (D28).

### D28. A forgotten password is reset by an emailed link
Asked for by the owner. "Forgot your password?" on the Sign in tab takes an email; if it belongs to
a profile, the API emails a link that opens the page on "Choose a new password". Saving one signs
in with it.
- **The token**: 32 random bytes in the link, only its SHA-256 in `password_resets`, like a
  session. It works once and for an hour. Using it deletes it and the profile's other links, and
  ends every session, so a device signed in by whoever knew the old password is signed out.
- **The link** is `APP_URL#reset=<token>`. `APP_URL` comes from configuration, never from the
  request's Host header, so nobody can have the email point at their own site. The token is in
  the fragment, which browsers never send to a server, so it stays out of GitHub's and Render's
  logs. The page reads it, then takes it out of the address bar and the history.
- **The same answer either way**: 204 whether or not the email has a profile. The link is made
  and sent after replying, so the reply isn't slower for real profiles. Sign-up already says
  when an email is taken (409), so this hides little today, but it costs nothing.
- **Limits**: 3 emails an hour to one address (nobody can flood someone's inbox with them), 10 an
  hour from one IP, and failed resets share the sign-in throttle. All in memory, like D15's.
- **Resend sends it**, through its HTTP API (no SDK). nberkyilmaz.com already had Resend's DNS
  records. Its free plan sends 3,000 emails a month, 100 a day. `RESEND_API_KEY` is set in
  Render; without it (or `APP_URL`) the API answers 503 "isn't available yet" instead of
  pretending to send. On a laptop the email is printed in the API's terminal.
- The reset screen wakes the server as it opens, since whoever opened the link is about to use it.

Turned down: security questions (weak, and one more thing to forget); a code typed into the app
instead of a link (more steps, and the link already signs in on the device it is opened on).

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

### D25. Published as a page on GitHub Pages and an API on its own subdomain
The owner wanted it at `nberkyilmaz.com/hours-to-go/`, beside departure-brief, on the domain they
bought for a portfolio. GitHub Pages serves a project at a path on that domain once the account's
user site carries it, but serves files only. So the page goes there and the API runs on Render's
free plan at `hours-to-go-api.nberkyilmaz.com`. Steps and costs are in [deploy.md](deploy.md).

- **The API's address must be on `nberkyilmaz.com`.** Its cookie is then same-site with the page
  and kept. From `onrender.com` it would be a third-party cookie and browsers drop it.
- **CORS names the page's origin** (`ALLOWED_ORIGINS`), with credentials. SameSite=Lax still
  works, because a subdomain of the same domain is the same site.
- **Safari keeps such a cookie only 7 days**, since the API answers from a different server than
  the page. Renewing it on every open (D15) makes that matter only after a week away.

Turned down: a Cloudflare Worker routing `nberkyilmaz.com/hours-to-go/*` to Render, which would
keep one origin but needs the apex proxied by Cloudflare, against the DNS-only records GitHub Pages
needs for its certificate and departure-brief already relies on. And a subdomain of its own for
the whole app, because the owner asked for the path.

### D26. A browser that has never signed in doesn't wait for the server
Render's free plan sleeps after 15 minutes and takes about a minute to wake. The app used to ask
`/api/me` before showing anything, so every visitor would have waited on "Loading your
logbook…". Now a flag (`hours-to-go/signed-in` in localStorage, set on entering a profile, cleared
on sign-out or a 401, kept when the server is unreachable) decides: without it the app opens at
once as a guest and makes no call at all, which also saves the free plan's hours. With it the app
waits for the profile as before, and after 4 seconds says the server may be waking. Opening the
sign-up form pings `/api/health` so the server wakes while the pilot types: on the first focus in
the form, not on sight, since the welcome screen shows the form to every new visitor (D27). A
sign-up still waiting after 4 seconds says the server is waking. Cost: a pilot whose browser lost
the flag but kept the cookie opens as a guest and signs in again.

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

### D21. Plain CSS with light and dark tokens, and a look of its own: "glass cockpit"
No UI library. Colour tokens on `:root`, dark values under `prefers-color-scheme: dark`. 44 px touch
targets, 16 px inputs.

Hours to Go is its own product, headed for the App Store and Google Play as well as the web, so it
has its own identity rather than the portfolio's. The owner chose "glass cockpit" from three
directions (the others: a native-phone look with the system font, and black-and-yellow taxiway
signs):
- A graphite panel (#111827) for the bar, the welcome and the loading screen, with a 2 px cyan
  line along its edge.
- White and light grey pages; graphite pages in dark mode.
- Cyan, the colour a glass cockpit gives the values the pilot sets (heading bug, selected
  altitude), as the app's colour: #0e7490 on light (white text on it), #22d3ee on the panel and
  in dark mode (dark text on it). Green and amber were out, being met and needs attention.
- Two typefaces. B612, the typeface Airbus commissioned for its cockpit displays (self-hosted
  from `@fontsource/b612`, regular and bold), for the name, headings, buttons, tabs and big
  figures: its figures are even width, so columns line up. The phone's own font (San Francisco,
  Roboto, Segoe UI) for everything a pilot reads, because B612's flat-sided parentheses look like
  square brackets at small sizes, and "421.26(4)(a)" must not read as "421.26[4][a]".
- 10 px cards, 8 px buttons and inputs: squarer than a consumer app, like instrument bezels.
- Uppercase, letter-spaced labels for the name and the welcome's kicker, like panel legends.
- The mark and home-screen icons: the progress ring closing in cyan on graphite.

Solid cyan is kept for the main action on a screen and for progress. Notices are white with a cyan
edge, not a coloured fill. Green, amber and red still mean only met, needs attention, and wrong.
On a phone the tabs stay a bottom bar on the page's own colours (D18). Each new screen and tab
opens at its top.

Also turned down on the way, all on 2026-10-28:
- **Magenta** (the GPS course line) as the app's colour. It read as pink and the owner didn't
  want pink.
- **Barlow** as the font. Departure Brief had already taken it for its own identity, and each
  app is to have its own font.

Turned down: matching nberkyilmaz.com (sky-and-sunset masthead, warm paper, Plus Jakarta Sans).
It was built on 2026-10-28 from tokens the departure-brief session passed on, and the owner
rejected it the same day: the apps are separate products from the portfolio.

### D27. A first visit recommends a profile
The owner asked that opening the app recommend creating a profile. A browser that has never been
here (no `hours-to-go/welcomed` flag, nothing in its guest log) opens on a welcome screen: what
the app does in two lines, the sign-up form with a "Sign in" tab, and "Continue without a profile"
under it. Signing in or going on sets the flag. So does having signed in before the screen
existed (the D26 flag), so returning pilots never see it. A guest who has logged something goes
straight to it; from there the "only on this device" banner and the masthead's "Create profile"
button keep recommending a profile. The welcome calls nothing until the pilot starts on the form
(D26), so a portfolio visitor who only looks doesn't wake the server. Blocked storage counts as
welcomed: a welcome on every visit would be worse than none.

Turned down: a dismissible banner over Progress (easy to miss on a phone, and the existing banner
already does that once there is something to lose), and requiring a profile (guest mode stays, D16).

## Process

### D22. Check the UI in a real browser, at phone size, before calling it done
jsdom tests can't see layout. Three real bugs were only found in Edge at 390×844: the tab bar at the
top, the unreachable Save button, and cut-off fields. See the runbook.
