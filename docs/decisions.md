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
- the services, all in the US: Neon and Render in Ohio, Resend, GitHub, and Cloudflare for the owner's
  address;
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

### D39. Cost to go: the least flying, priced at the school's rates
The owner asked for it first among the features (roadmap, section 3), with a C172 at $220 an
hour with fuel, plus tax, and the instructor on top for dual. Each goal's summary now shows
"$14,500, left to pay, at least" next to the hours, with "About $21,500 at the 65 h average" under
it for the PPL, and a "How the cost is worked out" panel: hours by kind times the rate, the tax, the
total, what each hour past the minimum adds, and the pilot's rates. While the rates are the sample
ones, the card says so, with a link that opens the panel at the aeroplane's rate. The multi-engine rating (Transport Canada sets no minimum hours) and the ATPL
(mostly flown at work) aren't priced, and say why.

**The hours.** D4's "least flying left" is the largest single shortfall, so it can't say who is
in the aeroplane. A price needs dual and solo apart, because dual is the aeroplane plus the
instructor. So each goal in `goals.ts` has a plan: the least Transport Canada allows, laid out the
way schools teach it.
- **PPL**: the 12 h solo (5 h of it cross-country), and the rest of the 45 h dual: 33 + 12 from
  nothing. Schools' own estimates put the hours past the dual and solo minimums with the
  instructor: Adventure Aviation's at the minimum is exactly 33 + 12, Centennial College's 30 + 15,
  and at 65 h Ontario Flight Centre's is 51.2 dual + 15.8 solo. All in the aeroplane: few schools
  teach the PPL in a simulator.
- **Night rating**: 5 h dual (2 h cross-country) and 5 h solo at night, and the 10 h of dual
  instrument time on top.
- **CPL**: since the PPL, 35 h dual and 30 h solo, with the 2 h night cross-country counting
  toward the 5 h dual cross-country and the instrument time on top; then time building without an
  instructor to 200 h in all, 100 h PIC and 20 h PIC cross-country.
- **IFR**: the 50 h PIC cross-country without an instructor, and all 40 h of instrument time with
  one. Few train instrument time with a safety pilot.
- **VFR OTT**: the 15 h of dual instrument time. **Class 4**: the course's 30 h only; the 200 h
  needed before it come with a CPL.
- **Simulator**: given a simulator rate, the ground time each standard allows is done there, at
  the simulator plus the instructor, but only where it replaces aeroplane time. The CPL's 35 h dual
  is aeroplane time (the app's reading), so there a simulator only helps once those are flown.
- Dual and solo can't be the same flight, so a plan can come to more than D4's figure (after 45 h
  with the dual and solo cross-countries both open). The summary keeps D4's "at least"; the panel
  lists its own hours. A test checks that every plan but Class 4's (the course alone) covers at
  least D4's figure.

**The arithmetic.** Each kind of time is rounded up to the tenth of an hour, as schools bill.
Dual is the aeroplane plus the instructor, the simulator is its rate plus the instructor, and the
tax goes on the lot. The headline prices the minimum, so it says "at least", like the hours
beside it, and is rounded down to $100 (to $10 under $1,000) so it never tops the panel's total.
The other figures are rounded to the nearest and say "about": they are estimates, not quotes. Each
hour past the minimum is priced as dual. For the PPL the panel
also prices the 65 h that Ontario Flight Centre gives as the national average, because most
students need more than the minimum.

**The sample rates**, used until the pilot enters their own: $220 for a C172 with fuel, $90 for
the instructor, 13% tax, no simulator. The $220 is the owner's figure. Checked against school
websites on 2026-11-04:
- Waterloo Wellington Flight Centre: C172S $220, plus a $15 an hour fuel surcharge since
  2026-07-02; instructor $92; ALSIM simulator $135.
- Durham Flight Centre: C172 $195, instructor $85, Redbird simulator $80.
- Brantford Flight Centre: C172 $205, plus a $15 fuel surcharge.
- Rockcliffe Flying Club, Ottawa: C172 from $259 solo.
- Centennial College, Toronto: about $325 dual and $230 solo, worked out from its PPL estimate.
- Further west it costs more: Edmonton Flying Club $240 and $80 for the instructor; Adventure
  Aviation, Grande Prairie, $288.75 solo and $346.50 dual; Pacific Rim Aviation, Pitt Meadows,
  $262 and $355; Professional Flight Centre, Boundary Bay, $233 and $323.

So $220 is a Southern Ontario flying-club rate, at the low end nationally, and instructors are
$80 to $95 everywhere. Fuel surcharges are common, so the field asks for the rate with them. A
school that quotes a dual rate with the instructor in it is entered as its solo rate plus the
difference.

**Tax.** GST/HST applies to PPL training and to private ratings, the night rating included (CRA
GST/HST Memorandum 20-4, May 2022, paragraphs 56 and 59). Training for a commercial or airline
licence, an instrument rating or an instructor rating at a vocational school is exempt up to the
minimum flight time. Hours past the minimum and time building are taxed (paragraphs 53 to 55, 58,
60 to 62). The app takes one tax figure. Under the CPL, IFR and Class 4 it says the school may not
charge tax, and to set it to 0 if so.

**Not counted**, and the panel says so: ground school, briefings (Centennial bills 30 h of them
at $95 for the PPL), exam and flight-test fees, the medical, the licence.

The rates are `profile.rates`, null until entered, and saved like the rest of the profile.
Dollars are kept to the cent up to $10,000 an hour; the tax to three places up to 30%, so Quebec's
14.975 fits.

Turned down:
- **The 65 h average as the headline.** Transport Canada publishes no average, and the minimum is
  what the app can show from the standard. The 65 h figure is the line under it.
- **"About" on the headline**, as first published. Seen live on 2026-11-05, it read as the likely
  cost while it was the least: a student budgeting from it would be about $7,000 short at 65 h, and
  the 65 h figure was only in the closed panel. It now says "at least", with the 65 h figure on the
  card. The rates were in that panel too, which a pilot looking for them might not open.
- **A province picker for the tax.** Whether provincial sales tax applies to flight training
  varies, and the school's invoice is what counts.
- **Pricing D4's figure as all dual.** It overstates goals with solo time and understates a plan
  with dual and solo both open.
- **Exam, flight-test and licence fees as lines.** They differ by school and examiner. They could
  come later as optional one-off lines.

### D40. Finish date: the plan's time left, at the pace of the last 8 weeks
The second feature (roadmap, section 3). The owner's words: "At your pace (2.4 h a week) you'll
reach the PPL minimum around March." Under the hours and the price each goal now says "At your
pace, 1.3 h a week, you'll reach the minimum around June 2027, and the 65 h average around
September 2027", and under it where the pace comes from.

**The pace** is the flight and FTD time logged a week (`rules/pace.ts`).
- **Over the last 8 weeks.** Students fly once to three times a week and lose whole weeks to
  weather. Over 4 weeks one grounded fortnight halves the pace; over 12 a student who has just
  started flying more takes months to see it. 8 weeks is between.
- **From flights logged one by one.** Paper totals are a lump with one date, so they never count,
  and the flying before their date can't be told apart: the pace starts the day after the latest.
  With no paper totals it starts at the first flight, so a new student isn't measured over weeks
  before they began. Either way over at least 14 days, so two flights in two days aren't a pace.
- **Two flights at least** in that time, or there is no date. The card then says that a date
  needs two flights in the last 8 weeks, unless the logbook is empty: that has its own call to add
  hours.
- **FTD sessions count**, because a goal's plan puts time in a simulator when the pilot has a
  simulator rate, and FTD time counts toward the PPL and the instrument time.

**The time left** is the plan the price is for (D39), all of it: dual, simulator and solo. So the
date and the price never disagree, and like the price it can be more than D4's "at least"
(the IFR's 40 h of instrument time with an instructor and 50 h cross-country as PIC are different
flights). A goal that isn't priced uses D4's figure: the ATPL. The multi-engine rating has no
minimum, so no date. For the PPL the line goes on to the 65 h average, from the same `toAverage`
the price uses.

**The date** is today plus the time left at the pace, shown as a month ("June 2027", or "June" this
year): it's an estimate, and a day would claim more than it knows. Past five years it says the
minimum is more than 5 years away instead, which is the ATPL at most paces.

Turned down:
- **The pace since the first flight.** A student who flew weekly in the summer and monthly since
  would be told the summer's date.
- **A pace the pilot types in.** It's one more thing to fill in, and the logbook already knows.
- **Flight time only.** An IFR student doing their 20 h in the simulator would get a date as if
  they weren't flying.
- **A day, or a range.** A range would look precise about its own error, which nobody can know
  from a few weeks of flying.

### D43. The next flight: each kind of flight tried against the real rules
One flight can count toward several requirements, so which one a student flies next changes what
the training costs. Under the price, each goal now says which flight counts toward the most of
what is left, what it counts toward, and what it costs.

**It has no rules of its own.** `rules/next.ts` puts each kind of flight in the log as if it had
been flown and runs `evaluateGoal`, so it can't disagree with the Progress screen, and a change to
a requirement changes the suggestion with it.

**How flights are compared**, each at the pilot's usual length (the middle of their last ten, to
the half hour, 1.5 h if there are none):
1. How much closer the whole goal gets: the fall in the plan the price is for (D39).
2. How many open requirements it counts toward, which is the point.
3. How many it finishes, then the minutes of progress, then the price.

A flight is dropped if it doesn't get the goal closer, or if another flight, for no more money,
does at least as much toward everything this one does. Three are shown at most.

**The order schools teach in** isn't in the standard, and on the numbers alone a first-lesson
student would be told to fly a solo cross-country. So it holds these back:
- Nothing is suggested before a solo is in the log or a licence is held. The school's lessons set
  the order then, and there is nothing to choose between.
- Solo cross-country waits for the PPL's 3 h of dual cross-country, unless a licence is held.
- Night flights wait for a licence, and solo night for the night rating's 5 h dual at night.

**Double counting.** The CPL's 20 h of instrument time is "on top of" its night and cross-country
time, and the app's sums can't see that (D3). So the flight that mixes hood time into a
cross-country is offered only where the standard allows the overlap: the PPL, whose 17 h dual
"includes" both, and the IFR, whose long flight is exactly that. As a backstop, a flight that would
take more off the plan than it lasts is dropped.

**It knows the standard, not the school.** It doesn't know the syllabus, the weather, or what the
student is ready for, and students pay for what they fly. So the card says it's a suggestion and
that the instructor decides, and the order above is on the list for an instructor to check.

Turned down:
- **Planning every remaining flight.** A plan for 30 flights is out of date after the first, and
  implies a precision nobody has. The next one is what a student can take to a lesson.
- **Suggesting from the first flight.** See above.
- **A length the pilot picks.** One more control on a full card; their usual length is what they'll book.

### D44. What runs out stops counting
A pilot trusts a "met". Until now an exam written years ago, or a medical long expired, stayed met
for good, so the app could say someone was ready when Transport Canada would say they weren't.

- **Written exams count for 24 months.** Transport Canada: "Examinations must be written within 24
  months of applying for the permit or licence" (general information on pilot licences; also the
  PPL study guide, TP 12880, and the application form). It isn't in Standard 421, so it's the one
  rule here without a paragraph to cite.
- **Flight tests count for 12 months** where the standard says "within the 12 months preceding the
  date of application": PPL, CPL, ATPL and the night rating's qualifying flight (421.26(5),
  421.30(5)(a), 421.34(5)(a), 421.42(1)). The IFR, VFR OTT, multi-engine and Class 4 sections state
  no limit, so none is applied.
- **The letter for the flight test** (421.14(3)): dated within the 30 days before it, once only, for
  the PPL and CPL. The app didn't have this requirement at all.
- **The medical counts to the "valid to" date the pilot enters.** How long one lasts depends on age,
  licence and the flying done (CAR 404.04), and it runs from the first of the next month, so working
  it out would mean asking for a birth date to guess what's printed on the certificate.
  Changing the category clears the date: it's a different certificate.

Each counts through its last day. It shows "Counts until March 1, 2028", in amber within 60 days,
and once past that it says when it ran out and stops being met, which reopens what depended on
it: an exam that has run out needs writing again, so its gate and "Can you write it yet?" come back
and the letter it used no longer counts as used.

An item with no date can't be checked, so it counts as before. And none of this applies once what it
was for is held (`validUnless`): an old PPAER doesn't matter to someone with a PPL, and an INRAT
that earned an instrument rating stays good for the ATPL.

Turned down:
- **Working out the medical's expiry from a birth date.** Personal data, and a calculation that can
  only be less right than the certificate in the pilot's hand.
- **Leaving an expired item met with a warning.** "Met" is the word the whole app is built on.

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
(Since D41 the queue is kept on the device, and a change that can't reach the server waits rather
than failing. A change the server refuses still goes as this says.)

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
the flag but kept the cookie opens as a guest and signs in again. (Since D41, a browser with a
copy of the profile opens on it at once and refreshes behind it, without waiting.)

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
- **`FEEDBACK_TO` is `contact@nberkyilmaz.com`, written in `render.yaml`.** It began as a personal
  address typed in Render's dashboard, to keep that out of this public repository. An address on
  the owner's own domain is there to be published, and this way it's set with the deploy.
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

### D41. Offline: the app kept on the device, and changes kept until the server has them
Pilots often have no signal at the airport, which is when a flight gets logged. Before this, the
home-screen app wouldn't open without a connection; a signed-in pilot who opened it offline was
dropped into the guest log; and a change made as the signal went was lost on the next reload. It
replaces the failure half of D17, and the wait in D26 for a browser that has a copy.

**The app** is kept by a service worker, `src/sw.js`, under 80 lines by hand. The build
(`vite.config.ts`) writes in the name of every file it made and a version from their contents, so a
new version is stored whole when it installs and the old one goes when it takes over.
- Pages come from the network if it answers within 4 seconds, so a new version shows at once;
  otherwise from the copy kept. A weak signal can hang for a minute, which is worse than none.
- Built files have their content's hash in the name, so a kept one is never out of date.
- It never touches the API: those answers are the pilot's, and the app decides what to do without
  them.

**The logbook**, signed in, is a copy on the device (`hours-to-go/account/<email>` in
localStorage, `model/sync.ts`): the logbook as the server last had it, and the changes it doesn't
have yet, oldest first. Each change is added there before anything is sent and leaves only once
the server has it, so closing the app loses nothing. The screen is the server's copy with the
waiting changes on top. They go when the app is opened, when the browser says it's back online,
when the pilot comes back to the app, and every 30 seconds while any are waiting. All three kinds of
change are safe to send twice: a line is stored by its id, and deleting a missing line is fine.

**Two devices, both offline.** This is the hard part, so each case is decided:
- *Different flights on each device* both survive: each line has its own id.
- *The same line edited on both*: the last to reach the server wins the whole line. Mixing two
  edits field by field would make a flight nobody logged.
- *A line deleted on one and edited on the other*: whichever reaches the server last. An edit after
  a delete brings the line back, the safe way round: deleting a flight twice beats losing one.
- *The profile* is sent as what changed, not whole: each field, and each item of a set (one licence
  held, one milestone, one training start). The waiting changes go on top of the newest profile,
  and the app fetches the server's copy first after any time offline. So ticking a milestone on the
  phone doesn't undo the medical changed on the laptop.

**When a change can't be saved:**
- Out of reach, or a 5xx: it waits. The top bar says "Offline" in amber, and a note says how many
  changes are kept. Nothing is reverted and it isn't an error.
- Refused (a 4xx): sending it again won't help, so it's dropped, a banner says so, and the screen
  shows what the profile has.
- A 401: signed out, as before. Changes still waiting stay on the device, under that address, and
  go when that address signs in again; a different address never gets them.

**Signing out** sends what's waiting first, and refuses if it can't, because signing out takes
the copy off the device. Deleting the profile removes it too, and so does a session that ends with
nothing waiting. The privacy page says all this.

With a copy, the app also opens at once and refreshes behind it, so the sleeping free server (D26)
no longer holds up anyone who has signed in on that device before. Importing a file, moving guest
entries in and account changes still need the server, and say so.

Turned down:
- **Workbox or vite-plugin-pwa.** A dependency and a generated worker, to save under 80 lines whose
  every rule can be read here.
- **IndexedDB.** localStorage is simpler and synchronous, so a change is stored before anything
  else happens. A line is under 1 KB, so thousands fit in its 5 MB.
- **The Background Sync API.** Safari doesn't have it, so it wouldn't work on an iPhone. Trying
  again while the app is open covers it, and opening the app sends what's waiting.
- **Version numbers per line on the server**, to detect conflicts. A table change and a conflict
  screen for what is one pilot's own devices, where the last edit is nearly always the right one.

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

### D45. Nothing typed is lost, and one notice at a time
From the audit's first batch ([ux-audit.md](ux-audit.md)).
- **The entry form is a native `<dialog>`**, opened with `showModal()`: focus stays inside and the page
  behind is inert. Focus goes to the sheet rather than a box, so a phone doesn't raise its keyboard or
  date wheel before anything is chosen, and it returns to the button that opened it.
- **Leaving asks first** if anything was typed, from Cancel, Esc, a click outside or Back. Opening the
  form adds a history entry, so Back closes the form; without it, Back left the app with the flight.
  There is one Cancel now, at the top, away from Save.
- **A failed save goes to the problem**: it scrolls to the first thing wrong and focuses the box, with
  "1 thing to fix" by the Save button. The time's message moved from below Remarks to under its heading.
- **Doubts aren't errors.** More than 8 h on one flight, or a date ahead of today, is asked about once,
  and "Save anyway" keeps it. A long ferry flight is real; so is typing 13 for 1.3.
- **One notice at a time**, most pressing first, and "Later" lasts two weeks.
- **Round is worked out, square is yours to tick**, so the shape says which is which.

Turned down: a draft kept in storage (the quick form in the next batch makes a typed flight short), and
`window.confirm` for leaving (it can't say "Keep editing", and it sits badly with Back).

### D46. A quick form on top of the paper columns, and something back for logging
The audit's biggest finding: the form was the paper log on glass, 21 boxes over 1.8 screens for a flight
that needs one number, with the same time typed twice for a cross-country and "solo" split between a
box and a tick.

**The columns stay the record** (D6, D10). The quick form is a faster way to fill them: Dual, Solo or PIC,
the time, then Night, Cross-country or Hood, and landings. `model/quick.ts` turns those into the same
boxes, so saving, validation and the rules are all unchanged, and **Paper columns** shows the same flight
in them. A line that doesn't fit (time in two columns, multi-engine, actual IMC) opens in the columns, so
it's never forced into a shape that loses something. An ordinary dual flight is 3 taps and 3 digits.

- **It won't guess who was flying.** Defaulting to the last flight's kind would save a tap, and now and
  then log a solo as dual, which counts toward the wrong requirements in a legal record.
- **Landings start at 1**, since a flight ends in one. The destination starts at the departure, and
  choosing Cross-country clears it and asks.
- **The aircraft and route are one line** with Change, from the last flight.

**The + is on every tab**: by the thumb on a phone or tablet, a button in the bar on a wider screen. The
home-screen icon has a "Log a flight" shortcut. Tapping the tab you're on goes to its top.

**Saving gives something back.** "1.3 h logged. PPL: 43.7 h to go, was 45.0", and what the flight finished,
from the rules (`rules/moment.ts`), with See progress and Undo. Deleting no longer asks: it deletes and
offers Undo, which is both faster and safer than a question people learn to dismiss.

A phone's keyboard covers the screen without resizing it, so the sheet takes its height from the visual
viewport. That part needs a real phone to confirm.

Turned down: replacing the columns (the record has to match the paper log), and a toast that vanishes in
4 seconds (Undo has to be reachable by someone who has already looked away).

### D47. Progress answers "how far am I?" first
Replaces D18's order. The screen read as the structure of Standard 421: 4.8 screens, the first progress
bar 3 screens down, what's unlocked repeated three times, and a bar saying 25% to someone who had flown
58% of their hours (it counted requirements).

- **A ring, by hours** (`rules/progress.ts`), then "23.8 of 45.0 h", then the price. The figure is the plan
  the price and finish date are for, or D4's when that's larger (Class 4's prerequisites), so the three
  never disagree. A goal with no hours in it goes by what's ticked. It never says 100% until every
  requirement is met.
- **One goal switcher**, the "Working on" list at the top of the card, showing how far along the others
  are. The grid of nine cards at the bottom did the same job and changed the page 3,800 px away from
  where the tap was.
- **What's left, then Done (n) folded**, the hours first. A row just ticked stays put while its date and
  mark are filled in.
- **What's unlocked is one line each**, and an exam's "Can you write it yet?" opens from its row.
- **Mark as held** moved from the top of the card, where a student working toward a licence could tap it
  by accident, to the end. When every requirement is met it comes back as the thing to do.
- **Milestones get a moment**: first solo, passing half way, finishing a requirement, finishing the goal.

### D48. A logbook that scales
A flight row was 157 px tall on a phone, four to a screen, with nothing on the first screen but buttons
and totals. 340 flights was 65 screens with no way to find one.

- **Two lines a flight**: "Nov 8 C172 C-GABC" and "CYKF → CYSN Dual 1.3 4 landings", with the total at
  the right. A tap opens it; Delete moved into the form, with Undo (D46), so it isn't 12 px from Edit on
  every row.
- **Months**, each with its flight time, so the year can come off every row.
- **Search and filters** appear from six entries. Every word typed must be on the line, in any order:
  date, aircraft, registration, airports or remarks.
- **Three totals on top**, the rest one fold away. The columns with nothing in them stay out of the table.

Turned down: a virtualised list (340 flights opens in about 200 ms, so it would add complexity for
nothing), and infinite scroll (a logbook is a record, and it should all be there).

### D49. First run and trust
- **The welcome shows what the app does before asking for anything**: a small picture of the ring and the
  hours. It still recommends a profile (D27), and both that and going on without one fit on a phone's first
  screen. The message that the server is waking moved above the button, where it's seen.
- **An empty logbook asks where the pilot is**: add hours, just starting, or already licensed. Everyone used
  to open as a student starting a PPL, and a licensed pilot had to discover Profile to say otherwise.
- **The numbers say how current they are, beside them**: "current to NSA 2025-008, checked nightly". It was
  only in Profile's footer.
- **Our readings are labelled.** Where the app interprets the standard (the questions for the instructor),
  the note says "Our reading. Ask your school.", so it doesn't read as fact.
- **The paper columns explain themselves**, in a fold at the top. The quick form uses plain words.
- **Account actions say what happened**: how many entries moved into a new profile, that a profile was
  deleted. The password can be shown, the forms say what's wrong in their own words rather than browser
  bubbles, and the export is offered at the point of deleting.

Turned down: a province picker for tax and regional sample rates (the audit's F14). D39 already turned it
down: whether provincial tax applies to flight training varies, and the school's invoice is what counts.

### D50. Made for reading outdoors
The audit's last batch. Students read this on an apron in the sun, so the base text went from 15 to 16 px,
nothing is under 14 px, secondary text is darker (7.6:1 on white), and progress bars are thicker on a
darker track. The paper columns are headed groups rather than outlined boxes inside boxes, a number stays
on the same line as its "h", and the small motion there is (the ring, the message after saving) stops for
anyone who has asked their device for less.

### D51. Starting a flight from one you know
- **Log this flight again**, in any logged flight or FTD session: a new line with today's date, the same
  times and route, and no remarks. Students fly the same lesson many times.
- **I flew this** on Your next flight opens the form already filled in with that flight, so the app's
  suggestion becomes the input.
- **What the pace costs a month**, under the finish date: the same hours and rates as the price, spread at
  the pilot's pace. It's what a student actually budgets.

### D52. Current to fly, for licensed pilots
From CAR 401.05, read directly. A card at the top of Progress once a licence is held, folded while everything
is current and open when something isn't:
- flown as pilot-in-command or co-pilot in the last 5 years (401.05(1)(a));
- recurrent training in the last 24 months (401.05(2)(a)). A licence or rating issued counts (421.05(2)(f)), so
  it starts from those dates, and the pilot can enter a later one;
- passengers by day and at night, 5 takeoffs and landings in 6 months, in the same class of aeroplane, so
  single-engine and multi-engine are counted apart (401.05(2)(b));
- with an instrument rating: a test or check in the last 24 months (401.05(3)), and 6 approaches in 6 months
  from the first day of the seventh month after it (401.05(3.1)). The regulation doesn't mention holds, though
  the roadmap had said it did.

It counts only flights logged one by one in an aircraft, and it says so: paper totals can't show when a landing
was, and a simulator counts only at Level B, C or D, which the log's one column can't tell. Not covered: the
12-month flight review that can stand in for the 5 years (401.05(1)(b)), and helicopters.

401.05(3.1) reads "following the first day of the seventh month after the completion of a test or check ... and
within six months before the flight". Taken as a limit on when the approaches were flown, nobody could fly IFR
in the first six months after a check, so it's read as when the requirement starts. An approach flown before
that day counts if it's within the six months. Worth confirming with an instructor.

### D53. Reminder emails, which a pilot turns on
A switch on the Profile tab, off until they turn it on, and only for an address they've confirmed. What's coming
up is worked out by `rules/reminders.ts` from the same evaluator and currency rules as the screen, so an email
can't disagree with Progress:
- the medical, exam results, letters, and flight tests that must be recent, wherever the pilot has entered a date;
- recurrent training and the instrument check, for a licensed pilot. Not the passenger items: they come round every
  few months and would only be noise.

**When.** 30 and 7 days before the last day, and only 7 for a letter, which lasts 30 or 60 days and would otherwise
get a month's notice the day it's dated. Nothing about what has already run out: the screen says so. One email per
pilot, with everything in it. Someone first seen late gets one email, not one per step.

**How it runs.** Render's free server sleeps, so a daily GitHub Actions run wakes it and calls
`POST /api/reminders/run` with `REMINDERS_KEY`. Without the key the switch says reminders aren't available, and the
workflow does nothing. `reminders_sent` remembers what's been said, by item, date and step, so a renewed medical
starts over. A mark is written after the email goes: a failure means it's sent twice rather than not at all.

**Limits.** 50 emails a run, soonest deadline first, leaving room in Resend's 100 a day for reset links. Whoever
doesn't fit is still unsent the next day.

**Stopping.** Every email has a link. It opens the app, which posts the token, so a mail scanner following the link
can't turn reminders off by accident. The token is stored as it is, not hashed, because it goes in every email and
all it can do is stop them.

### D54. A spreadsheet out, and a pilot's own spreadsheet in
"Export for a spreadsheet" on the Profile tab writes a CSV, in hours, oldest first, with a byte-order mark so Excel
reads accents. The JSON file stays the full backup: a CSV can't carry the profile or the answers on paper totals, so
those come back with their questions open.

**It doesn't guess.** Hours to Go has 17 time columns and a spreadsheet often has "Dual", "PIC" and "Night". Reading
"Dual" as single-engine day would count hours toward the wrong requirement and look right doing it. So a heading has
to say which column it is ("Single-engine day PIC", or "SE day PIC"). Other columns are listed as not used. For the
same reason a date has to start with the year: 03/04/2026 could be March or April. A file with no usable heading is
turned down with a sentence saying why.

**Nothing goes in until the pilot has seen it.** A preview gives the number of lines, the hours, the dates, and each
row that can't be added and why, so a column in minutes shows up as an absurd total before it's in the logbook. Rows
are held to the same rules as the form.

**Importing twice doesn't double it.** A row uses its Id if it has one. Without one, its id is a hash of the line, and
a second identical line in the file gets its own, so two identical circuits stay two.

Text that a spreadsheet would run as a formula gets a leading apostrophe, removed again on the way back in. Excel in
French Canada saves with semicolons and decimal commas, which import reads. Export is still comma-separated, which
that Excel may open as one column; French (roadmap 11) is the time to look at it.

### D55. The logbook on paper
"Print or save as PDF" on the Logbook tab opens every line in the columns of a Canadian paper log, sideways, and hands
over to the browser. Its Save as PDF is free and needs no library or server, so nothing leaves the device.

**Pages are counted, not left to the browser.** Each page has 26 one-line rows and its own "This page", "Brought
forward" and "Total to date", as a paper log does. If the browser chose the breaks, totals couldn't be placed at the
foot of a page and be right. One line a row is what makes that safe, so a remark too long for its row is cut short
there and written out in full on a last page. Nothing is lost.

**A number is never cut short.** A career's totals have to fit a column sized for one flight, so a long number is
printed smaller instead.

**Not claimed:** that an examiner or school will accept it. The screen says to ask them, and it's on the list of
questions for the flight school. The name is typed on the screen and isn't stored, since a profile has no name.

### D56. A read-only link for an instructor
On the Profile tab, signed in. It opens with no profile, so an instructor doesn't need one, and shows the pilot's
progress on what they're working on now.

**What it shows is decided in one place.** `rules/shared.ts` works out the figures on the server and only those are
sent: the goal, how far along, each requirement's hours or whether it's done. Never logbook lines, registrations,
exam marks, dates, rates or the email address. A requirement like "Category 3 medical" shows as met or not, which the
Profile tab and the privacy page both say. The page tells the instructor that nobody has checked these figures.

**The link is the permission, so it's treated like a password.** 256 random bits, of which only a one-way scramble is
stored, so the pilot sees it once and can make a new one. It's in the fragment, which stays out of server logs and
referrers. One per pilot: a new one replaces the old. It stops working after 30 days, when the pilot stops sharing, or
when the profile is deleted. Responses aren't cached, and repeated wrong links from one address are turned away.

Unlike a link in an email, it stays in the address bar, because an instructor is meant to come back to it.

**The name** is typed when the link is made and kept with it, since a profile has no name and an instructor may have
several students.

**Not yet:** logbook lines for an instructor, or anything that lets them sign off. Both would need the pilot's say-so
line by line, and instructor accounts.

### D57. French
All of it, not only the screens: the requirements, the error messages, the emails and the privacy page. The owner
chose to ship it as a best effort and fix it from reviews, since nobody French-speaking has read it yet.

**How it works.** English is the source and each phrase is its own key: `t('Log a flight')`. The code reads as it
did, and a phrase with no translation shows in English rather than breaking. No library, since a table and a function
are all it needs. The language comes from the browser the first time, and a link on the Welcome and Profile screens
changes it. Changing it reloads the page, so `t` is a plain function that can be called anywhere, with no context to
pass around. The table ships with the app (about 22 KB compressed), which also means it works offline.

**The server stays in English,** so what the rules work out on it is the same for everyone. The app translates what
comes back, because a sentence from the server is its own key too. The exceptions are emails, which go through a
`translator` for the language the app was in. Reminders keep that language with the switch that turned them on.

**The aviation terms are Transport Canada's,** from the French text of Standard 421, not a dictionary's: double
commande, commandant de bord (CdB on a column), vol-voyage, test en vol, instruction théorique au sol. An independent
reviewer checked the requirements against that text.

**Numbers and spreadsheets follow the language.** 1,5 h, 14 500 $, 14 mars 2028. A French spreadsheet uses semicolons,
decimal commas and French headings, which French Excel expects, and either language's file reads in either language.

**It can't quietly fall behind.** Tests fail if a phrase in the code or the regulatory data has no French, if a
placeholder is lost, or if text on a screen doesn't go through `t`.

The nightly check of the standard still reads the English page, which is the one the rules were written from.

### D58. What if you flew more or less
Under the finish date, a folded slider from half an hour to 15 hours a week. It starts at the pilot's own pace, or at 2
hours a week for someone with none yet, and gives the month they'd finish, what that pace costs a month, and how many
weeks or months sooner or later that is. It uses the same sum as the finish date, so the two can't disagree, and it saves
nothing: it's for thinking about a budget or a deadline, not a setting.

### D59. The flight clock
"Flying now? Start the clock" on the flight form, or a home-screen shortcut, and Landed when you're down. The form
opens with the time in tenths of an hour and the date the flight started.

Only the moment it started is stored, on this device, so it runs on with the app closed, the phone asleep or no
signal, and there's nothing to keep ticking. The bar is on every tab. Nothing stops until the flight is saved, so
cancelling the form doesn't lose the time. Past 12 hours it asks whether it was forgotten.

It measures what the pilot starts and stops. Whether that's air time or engine time is theirs to decide, and the form
lets them change it, so the app doesn't claim to know.

### D60. The route
One line under the next flight, with the aircraft at the ring's own figure, the flight test marked where its hours come,
and what's next written under it. It began as one leg for each part of the standard, in the standard's order, but
students fly and do ground school at the same time: at 60% of the hours the aircraft sat on "Knowledge", and an unticked
box pinned it at the start, so it looked broken beside the ring.

### D61. Cards to share
"Share my progress" on Progress makes a square picture: the ring, the goal, and the hours. A first solo, the halfway
point and the last requirement offer one right after the flight is logged, and most flights don't, since a button on
every one would mean nothing. A licence held gets its own.

It's drawn on a canvas in the browser and goes to the phone's share sheet, or downloads where there isn't one. Nothing
is uploaded, so the app has no part in where it ends up. The card says nothing the pilot didn't choose to show: no
name, no aircraft, no registration, no airport.

### D62. What a hostile request can do
An independent review before the first students came with concrete attacks, each reproduced, and one confirmed on the
live server.

- **The address that says who's asking is Cloudflare's** (`CF-Connecting-IP`), which Cloudflare sets itself and refuses
  from a client. `X-Forwarded-For` starts with whatever the client wrote, and Render passes it on, so every per-network
  limit could be walked around. Without the header it's the connection's address: at worst everyone is one network and
  the limits get tighter.
- **Failed sign-ins are also counted per profile**, at 50 in 15 minutes from anywhere, in case the guesses come from many
  networks. It's high because it can lock the pilot out too, and a password reset clears it.
- **An address is checked for length before the pattern**, which slows badly on a very long string. A request body is
  limited to 64 KB, except a whole logbook arriving at once.
- **The throttles keep at most 10,000 keys**, so a flood of new ones can't use up the memory.
- **A reset or a new password cancels a change of address still waiting.** Otherwise someone who knew the old password
  could finish moving the profile after being thrown out. The old address gets an email whenever a profile moves.
- **A date has to be on the calendar**, and one pilot's record that can't be worked out doesn't stop the others'
  reminders.

### D63. Fixes from the same review
- **Coming back to the app reads the server again**, if it's been over a minute, and a profile change reads it first. A
  device left open used to send its old copy of the profile over what another device had saved.
- **A flight the quick form can't fully show opens in the paper columns.** Flown again or suggested, it used to open
  blank with its other columns still filled in, and they were saved unseen, so a multi-engine flight counted twice.
- **The toast's hours are the ring's hours.** They were two sums, and could differ by a lot.
- **Paper totals aren't a flight.** Adding them says what was added and goes to Progress, with no first solo to
  celebrate, and they sit under their own heading in the Logbook rather than in the month they're dated.
- **Near the end, the price says what's left** rather than a month's flying that costs more than that.
- **A spreadsheet's own Id column counts only if this app made it.** 1, 2, 3 in two files aren't the same flights.

### D64. What the first screen is for
A fresh audit, after the features went in, counted 15 figures before anything to do, with Your next flight off the first
screen. From the top now: the goal as a title, the ring and hours, the price, the date, then the next flight with a real
button, and the route. The what-if and the working-out are folds below it. The citation and Share go at the end of the
card, and "5 of 13 requirements met" heads the list it counts. This reorders D47.

The goal stays a native select, laid invisibly over its title, so a phone still opens its own picker. The school's rates
have a sheet of their own with a Done button, because they're what makes the biggest number on the screen the pilot's own
and they used to be 1,100 px down in a fold.

### D65. Getting set up
- **After paper totals, one card asks what the hours can't show**: the medical, ground school, the letter and the exam,
  answered where they are. It's only for a logbook with paper totals, since a student logging flight by flight would be
  asked every two weeks about an exam that isn't due yet. Later puts it off for two weeks.
- **A licensed pilot keeps the way to add hours.** Done closes the list of licences and leaves Add my hours. The PPL's
  date is asked there, and again on the CPL, where commercial training counts from it.
- **Current to fly stays folded until a flight is logged**, since four alarms on an empty logbook only say it's empty.
  Passengers at night is left out for a pilot with no night rating or night flying.

### D66. The moments, the clock and the form
- **A first solo, halfway and the last requirement open a sheet with the card itself**, which stays until it's closed,
  with Share and Undo. They used to be the same line that fades after any other flight.
- **The clock lives where the thumb is.** While it runs, the + becomes "Landed · 1:12", and the top banner is kept only
  for a clock that was probably forgotten. It can also start from Your next flight, since the bottom of the flight form
  is where nobody would find it.
- **Who was flying is one row**, Dual, Solo, PIC, with the plain words under the one chosen (D49). Landings sits beside
  the time, so the keyboard doesn't hide it and a default of 1 can't save unseen.
- **Going down the page, the + steps aside**, and the Logbook's three less-used links are under More.

### D67. The requirements list, and a wide screen
- **Each requirement is two lines**: what it is, then its bar, its figures and the paragraph it comes from. The
  citation used to follow the label and wrap it onto another line. Every line still has one (D2).
- **One level in at most.** What sits under a sub-requirement is listed beside it, so the CPL's night landings aren't
  three indents deep on a phone.
- **A plain note is a tap away**, behind ⓘ. Our readings stay in view (D3): they're where the app chose, and a student
  should see that without asking.
- **From 1100 px the plan and the requirements sit side by side.** The hours, price, date, next flight and route are on
  the left, with Share and the source under them; what's unlocked and the list are on the right, so the list starts on
  the first screen. Held, the list is only for reference and keeps the full width. Profile's cards go in two columns
  that keep their places while a form in one of them grows, the account and licences on the left.
- **A guest's "Saved on this device only" goes below 1180 px.** In French it pushed Create profile off a 1024 px screen,
  an iPad on its side. The banner on Progress says the same.

### D68. What was left over
- **The welcome's first tab says New profile.** The heading, the tab and the button under it all said Create profile.
- **A time shown as h:mm says what it means.** Editing keeps a time that isn't a whole tenth as h:mm rather than round
  it (D7), and under a box labelled in hours, "0:20" was a puzzle. It now says "That's 20 minutes."
- **The first solo's card can be shared again**, beside Share my progress on the PPL, dated the day of the first solo in
  the log. It used to be offered once, in the sheet after logging it. Halfway isn't: the log would have to be replayed
  flight by flight to find its day.

### D69. A more finished look
A pass on how it looks, inside D21's glass cockpit rather than a new one.
- **Buttons on the panel use the panel's cyan**, the bright one, in both modes, as the welcome already did. The page's
  teal was dull on graphite. Beside Log a flight, a guest's Create profile is outlined, so the bar has one main action;
  on a phone, where Log a flight is the +, it stays solid.
- **The welcome on a computer is two columns** from 1100 px: the headline, the example and the three points on the left,
  the form on the right, so it starts on the first screen rather than under the headline. The panel still runs the full
  width. A browser without CSS subgrid keeps the one column.
- **The plan has one box in it**, Your next flight, with the cyan edge of something to do and its heading in cyan. The
  price is a readout like the hours, set off by a hairline, and How the cost is worked out is a fold like the what-if.
  There were three grey boxes of three different kinds.
- **The wide logbook shows the remarks**, between the route and the figures, when any flight has some. The room was
  empty, and the remarks could be searched but not seen without opening each flight. A phone's two lines stay as they
  were.

## Process

### D22. Check the UI in a real browser, at phone size, before calling it done
jsdom tests can't see layout. Three real bugs were only found in Edge at 390×844: the tab bar at the
top, the unreachable Save button, and cut-off fields. See the runbook.

### D42. A nightly check of the standard the rules were written from
The rules are only as right as Standard 421, and Transport Canada amends it. Students plan paid
training around these numbers, and nobody re-reads a standard that long on the off chance. So
`.github/workflows/standard.yml` reads Transport Canada's page every night and compares it with a
copy kept here, `scripts/standard-421.json`. It costs nothing and doesn't touch the live app.

- **What is compared:** only the 10 sections the app cites (74 distinct citations, used 126 times,
  read from `goals.ts` so the list can't go stale). A change to the helicopter sections is no
  reason to alert anyone.
- **By subsection**, "421.26(4)". The page marks those reliably. Deeper than that its lists run
  together, and a subsection is what a person would re-read anyway.
- **The alert is one GitHub issue**, which GitHub emails: the subsection, the lines that changed,
  and the requirements in the app that rest on it. It is updated only if the page changes again,
  not every night. It stays until someone reads the change, fixes `goals.ts` if it needs it, and
  runs `npm run standard:update` in a pull request.
- **A page it can't read fails the run**, which GitHub also emails, so a broken watcher doesn't look
  like a quiet standard. The same goes for a cited section that has gone: renumbered, or the page's
  layout changed.
- **A test holds every citation in the app against the stored copy**, down to the paragraph, so a
  mistyped or stale citation fails CI. All 74 passed the first time it ran.

It doesn't change the rules: a person reads the amendment first. It sees only this page, so an
exemption or a change published elsewhere, or a change to the medical standards, won't show.
GitHub pauses scheduled workflows in a repository with no activity for 60 days, and emails when it
does; **Actions → Standard 421 → Enable** starts it again. The copy is of a public Government of
Canada page, with its source named in the file.

Turned down:
- **Watching the page's "Date modified".** It can move with nothing changed, and can't say what did.
- **A hash of each section instead of its text.** Smaller, but the alert couldn't show what changed.
- **Emailing through Resend.** A secret and another way to fail, when GitHub already emails an
  issue, and an issue is a to-do with a history.
