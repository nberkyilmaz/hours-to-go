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

### D30. A privacy and terms page of its own
Pilots give the app their email and their flight records, the data is stored in the United States,
and both app stores will ask for a privacy policy's address. So `privacy/index.html` is a second
page in the Vite build, published at `/hours-to-go/privacy/`. It is plain HTML that reads without
JavaScript, and borrows the app's fonts and styles through `src/privacy.ts`.

In the app's plain words it says:
- who runs it: the owner, by name;
- what is stored with and without a profile, and the one cookie;
- what feedback sends, and that hosts log IP addresses;
- the services, all in the US: Neon and Render in Ohio, Resend, GitHub, and Google for the owner's
  inbox;
- how long things are kept: until deletion, plus 90 days in backups;
- how to export and delete, and the Privacy Commissioner of Canada;
- the terms: free, a study aid and not an official record, interpretations may be wrong, no
  warranty, fair use, and notice by email if it ever closes.

It is linked from the welcome's footer, under the sign-up button ("Creating a profile means you
agree to the privacy and terms") and from the Profile tab's footer. It must change whenever what
is stored, or who stores it, changes: a new service, analytics, the store apps. It is a
plain-language draft, not reviewed by a lawyer.

Turned down: a screen inside the app (it needs the app and JavaScript to load, and the stores want
a plain address); a policy generated from a template site (long, generic, and wrong in the details
that matter here).

### D32. Free until it has users
On 2026-10-29 the owner agreed the plan in [roadmap.md](roadmap.md): fix the gaps, build every
feature on the list, test with a few pilots, then advertise. Until there are users, nothing that
costs money:
- Render stays on the free plan, wake-up wait included.
- The app stays at `nberkyilmaz.com/hours-to-go/`. A domain of its own, with a support address on
  it, comes when the project grows.
- The store apps wait.

So each fix uses what is already free or paid for: GitHub, Neon's and Render's free plans, and
Resend's free plan.

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
forgotten password is reset by an emailed link (D28); signed in, the email and password can be
changed (D35).

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

### D29. Nightly backups, in a private repository
Neon's free plan can roll back only a short recent window, and losing a pilot's logbook is the
worst thing this app could do. A GitHub Actions workflow in the private repository
`nberkyilmaz/hours-to-go-backups` runs every night at 08:23 UTC:
1. `pg_dump`, in custom format, from the `postgres:18` image so its version matches Neon's.
2. The copy is restored into an empty Postgres 18 in the same run, and the rows are counted. A
   copy that won't restore fails the run, and GitHub emails the owner.
3. The copy is kept as the run's artifact for 90 days.

Restoring is described in that repository's README, and in [deploy.md](deploy.md), step 8.

- **Private**, because each copy holds every pilot's email and logbook. This repository is
  public, so anyone could download its artifacts.
- **A second repository**, also because GitHub turns off scheduled workflows in a public repository
  after 60 days without activity.
- **Free**: a private repository's 2,000 Actions minutes and 500 MB of artifacts a month. A run
  takes about a minute.
- **The connection**: the repository secret `DATABASE_URL` is Neon's direct connection string,
  with pooling off, because `pg_dump` doesn't work through Neon's pooler.
- **Deleted profiles** stay in the copies for up to 90 days, which the privacy page says (D30).
- A change to the workflow proves itself on its pull request, which makes a real copy and restore.

Turned down:
- Encrypted copies kept as artifacts of this public repository: a key to lose, and the 60-day
  switch-off.
- Cloudflare R2 or Amazon S3: a new account with a card on file.
- Neon's longer restore window: a paid plan (D32).

### D31. Feedback goes to the owner's inbox
The owner wanted a way to be reached, without a support address until the app has a domain of its
own (D32). "Send feedback" on the Profile tab posts to `POST /api/feedback`. That emails
`FEEDBACK_TO` through Resend, with the pilot's address as Reply-To, so replying in the inbox
answers the pilot. Signed in, the address is the profile's and the form asks for nothing; as a
guest, the pilot may type one.

- **Nothing is stored in the database.** A message is an email, and the inbox is where the owner
  reads anyway.
- **`FEEDBACK_TO` is typed in Render's dashboard**, not written in `render.yaml`, so the owner's
  personal address isn't published in this public repository.
- **Sent before replying.** A message that didn't go says so (502), and stays in the box.
- **The browser's User-Agent goes with it**, to help with "it doesn't work". The form and the privacy
  page say so.
- **Limits**: 5 an hour from one IP, and 30 a day in all, so nobody can use up the 100 emails a day
  that reset links also need. Messages are up to 4,000 characters, and escaped in the HTML email.

Turned down:
- A support address: it needs the domain, which comes later.
- A feedback table: another place for personal data, and something to build to read it.
- A form service such as Formspree: a new account, and another company holding the messages.
- GitHub issues: public, and it needs a GitHub account.

### D33. Changes to the tables are numbered steps, each run once
Confirming emails was the first change to a table that already had rows in production (`users`).
`create table if not exists` can't do that, so `server/db.ts` now has `MIGRATIONS`, a list of steps.
When the server starts it runs every step the `migrations` table hasn't recorded, in one
transaction, and records them.

- **Step 1 is the old list**, unchanged, so on Neon's existing database it finds every table already
  there and only records itself.
- **Never edit a published step**: Neon has run it. A change is a new step at the end.
- **One transaction for all of it**, because Postgres can undo table changes: a step that fails
  leaves the database as it was, and the server doesn't start.
- **An advisory lock** first, because a deploy starts the new server while the old one still runs,
  and two new ones could start together.
- A test builds the first release's `users` table with a pilot in it, then starts the server on it
  twice, on PGlite and on Postgres in CI.

Turned down: a migration library (one more dependency for a dozen lines); steps run by hand from a
laptop (easy to forget, and the server would start against tables it doesn't expect).

### D34. Confirming an email is asked for, never required
The owner agreed to it as the gentle kind. Sign-up works at once, as before, and then emails a link
that confirms the address. Until it's opened:
- a banner above Progress and Logbook says why it matters (a password reset needs to reach you),
  with "Send a new link" and "Later", which hides it until the app is next opened;
- the Profile card says the same, with "Wrong address? Change it".

Nothing is blocked or deleted for being unconfirmed. Opening a reset link confirms the address
too, since it reached the inbox.

- **The link** is `APP_URL#confirm=<token>`, built and stored like a reset link (D28): only the
  token's SHA-256 is kept, in `email_links` with the address it confirms. It works once and for
  7 days. Opening it needs no sign-in, since email apps open links in a browser of their own.
- **Spent from the page, not by opening it**: the token is in the fragment and the page posts it.
  Mail scanners that fetch every link in an email can't use it up.
- **Limits**: 3 links an hour to one profile, and 50 a day in all, so the 100 emails a day Resend's
  free plan allows stay mostly free for reset links. Past the daily cap a sign-up still works; its
  link waits for "Send a new link".
- Profiles from before this have no confirmed address, and see the notice.

Turned down: blocking sign-in until the address is confirmed (a student at the airport would lose
the app to an email in spam); deleting unconfirmed profiles after a while (their logbooks).

### D35. The email and password can be changed while signed in
Both are on the Profile card, and both ask for the current password.
- **A new email takes over only once its link is opened.** Until then the profile keeps the old
  one and shows the change waiting, with "Cancel the change". A typo can't lock anyone out, and
  nobody can move a profile to an address they don't read. Asking again replaces the waiting
  change. If another profile signs up with the new address in the meantime, the link says so and
  nothing moves.
- **Moving deletes every email and reset link the profile had.** An old link to confirm the old
  address would otherwise move it back, and a reset link in the old inbox would still work.
- **The email to the new address doesn't name the old one**, since a mistyped address reaches a
  stranger.
- **A new password signs out every other device** and spends any waiting reset link, as a reset
  does (D28); this device stays signed in.
- Wrong passwords on these (and on deleting the profile) count toward the sign-in limit, per
  profile.

### D36. Sign-ups are limited per network
Only sign-in was limited, so a script could fill the free database with profiles, and since
D34, Resend's daily emails too. Now: 20 sign-ups an hour from one IP. That is enough for a class
signing up together on the school's Wi-Fi (the classmate test in the roadmap). In memory, like
the other limits (D15).

Turned down: a CAPTCHA (another company's script on the page, and a puzzle in the way of
students); a daily cap on all sign-ups (one script could then stop every real student).

### D37. Errors email the owner
A failure the pilot didn't cause used to reach only Render's logs, which nobody reads unprompted,
and the pilot saw "Internal Server Error". Now:
- **The pilot** gets "Something went wrong on our side. Try again in a few minutes." A request
  that was itself wrong (bad JSON, too big) still says why, with its 4xx.
- **The owner** gets an email to `FEEDBACK_TO`, through Resend: what was asked (method and path),
  when, and the error's stack. Never the request's body, which can hold a password. The same goes
  for an email that couldn't be sent (reset, confirm, feedback), since that usually means Resend's
  key or quota.
- **At most 5 an hour**, so a failure on every request can't flood the inbox or use up the day's
  emails. Render's logs still have every one.
- **Not alerted**: Neon closing an idle connection, which the pool reports and recovers from many
  times a day.

Turned down: an error service such as Sentry (a new account, and another company holding stack
traces); a separate `ALERT_TO` (one more setting for the same inbox).

### D38. A shared link shows a picture
`index.html` carries Open Graph tags and `public/og.png`, 1200 × 630, which group chats, Instagram,
Facebook and others show with a shared link. The picture is the welcome screen's look: the name,
the headline, and a gauge with hours to go. It was drawn as HTML with the app's colours and B612,
and saved from Edge. Previews need full addresses, so the tags name
`https://nberkyilmaz.com/hours-to-go/`; they move with the site if it gets a domain of its own.

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
