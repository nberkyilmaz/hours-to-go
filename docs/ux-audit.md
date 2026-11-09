# Hours to Go: UI and UX audit

Audited 8 November 2026 on the app as of commit `f53725d`, with a throwaway database, in Microsoft Edge through Playwright. The phone context was 390 x 844 at 2x with touch. Also checked at 320, 768, 844 x 390 (a phone on its side) and 1280 wide, in light and dark.

This was done by a reviewer who hadn't built the app, and asked to be blunt. "I" below is that reviewer. The findings marked as judgement are opinion; the rest was measured.

**Checked afterward, independently, by reproducing them on the same build:** F2 (no way to log from Progress), F4 (the error 545 px below the visible area, with nothing moving), F6 (Esc discards a typed flight, Back leaves the app), F7 (a 130 h flight dated 2030 saves and becomes the Grand total), F9 (the row heights, and one letter per line at 768), F5's bar counting requirements not hours, F13's "Later" being forgotten, F18's currency note living only on Profile, and F20's 2.77:1. F19 needed one correction, made below.

Code references are relative to the repository root. Effort: **S** is under half a day, **M** is one to three days, **L** is a week or more. I read `docs/decisions.md` only after the findings below were written. Section 7 lists where they collide with a recorded decision.

---

## 1. Verdict

**The app is correct, careful and trustworthy, and using it feels like filling in a government form.**

The engineering underneath is strong: every requirement is cited, the "at least" figures don't overpromise, offline works, and the automated accessibility scan is nearly clean. The UI weakness is not sloppiness. It's that the screens were designed around the *data* (paper log columns, the structure of Standard 421) and not around the two moments the app exists for.

- **Just landed, one thumb.** The form is the paper logbook on glass: 21 inputs across 1.8 screens, for a flight that needs one number. The time has to go in the right cell of a grid. Nothing confirms the save, and if something is wrong Save can appear to do nothing.
- **"How far am I?"** The Progress tab answers with what's left in words, then scrolls for 4.8 screens. There is no picture of progress at the top. The first progress bar is 2,592 px down, and the same facts appear up to three times.
- **Motivation is absent.** Finishing a flight, a requirement or a whole licence looks the same as doing nothing.

There are also real bugs that a first tester will hit: the Logbook collapses into a column one letter wide on tablets, a typed flight is lost to a single Back gesture, and a 13-hour typo is accepted without comment.

I would not advertise it yet. Batches A and B in section 5 are the minimum, and they are about two weeks of work. None of this needs a rewrite: the model, rules and offline layer can all stay.

---

## 2. What's already good and must be kept

- **Citations on every requirement, and interpretations written down.** This is the app's reason to be trusted.
- **The "at least" framing and "About $12,900 at the 65 h average".** It tells a student the minimum is not what they will pay. That is rare and valuable.
- **Your next flight.** The best idea in the product. It needs a better position and fewer words, not rethinking.
- **Offline.** Logged a flight with no connection, got a calm banner and an "Offline" badge, and it synced by itself. A return visit opens in about a second even on a very weak signal. A dead API while online is handled the same way.
- **Guest mode, and the move into a profile.** No flight was lost in any path I tried.
- **Save pinned at the bottom** of the form, in thumb reach, with the live "Flight time on this line".
- **Pre-filling** the aircraft, registration and departure from the last flight.
- **Bottom navigation on phones, 16 px inputs** (no iOS zoom), correct `inputmode` on number boxes, safe-area handling, no horizontal overflow at 320 px.
- **Dark mode** is designed, not inverted.
- **Plain error sentences.** "Email or password is incorrect", "Hours, like 1.3 or 1:18", and the waking-server explanations.
- **The welcome hero and brand mark.** This is the best-looking screen in the app, and the inside should catch up to it.

---

## 3. Measurements

### Automated accessibility (axe-core, WCAG 2.0 to 2.2 A and AA, plus best practice)

| Screen | Light | Dark | What it found |
|---|---|---|---|
| Welcome, Sign in | 0 | 0 | |
| Progress, cost panel open | 1 | 1 | Best practice: heading order (`h1` to `h3`, `#next-title`) |
| Logbook, folds open | 1 | 1 | Best practice: no `h1` on the page |
| Flight, FTD, paper totals forms | 3 | 3 | Best practice: `role=dialog` on a `<form>`; the sheet's `<header>` makes a second banner landmark |
| Profile (guest, signed in, sub-forms) | 1 | 1 | Best practice: no `h1` |
| Profile: delete open | 1 | **2** | **WCAG 1.4.3 failure, serious:** white on `#f87171` is 2.76:1 |

That is one true WCAG failure in 30 scans (15 screens, light and dark). Axe could not decide 102 colour-contrast nodes over all runs, so I worked out the main pairs by hand. Axe only catches what a machine can see: the dialog failures in F19 came from driving the keyboard.

| Colour pair | Ratio | Note |
|---|---|---|
| Body text on white | 18.48 | |
| Muted text on white (hints, Dual/PIC labels) | 5.91 | AA pass |
| Muted text on grey tile | 5.18 | AA pass |
| Placeholder "0.0" on white | 4.61 | Just passes |
| Accent links on white | 5.36 | AA pass |
| **Unmet requirement ring on white** | **1.27** | Under the 3:1 for non-text in WCAG 1.4.11 |
| **Empty bar track on white** | **1.14** | Nearly invisible in sunlight |
| **Dark mode: white on delete button** | **2.77** | Fails |

### Tap targets under 44 x 44 CSS px, phone

| Screen | Under 44 | Worst offenders |
|---|---|---|
| Logbook (22 flights) | 47 of 55 | **Edit 24x36** and **Delete 41x36** on every row, 12 px apart; Later 34x31; Create profile 129x36 (twice) |
| Progress | 6 of 30 | **Enter your school's rates 154x21**; Later 34x31; medical select 115x36; Standard link 100x19 |
| Flight form | 3 | Header Cancel 45x31; + Multi-engine 138x31; Solo row 350x36 |
| Paper totals form | 5 | Header Cancel; + Multi-engine; All of it / None / Some 83 to 104 x 40 |
| Profile, guest | 16 of 28 | Every licence row 36 tall; Sign in tabs 38 tall |
| Profile, signed in | 17 of 26 | Change email / password / Delete all 31 tall; licence rows 36 tall |
| Welcome | 4 of 8 | Create profile / Sign in tabs 38 tall |

A tick box and its label count as one control here. Bottom-nav tabs pass. Axe reports no WCAG 2.5.8 failure (the AA minimum is 24 px). The 44 px bar is Apple's guidance and the right one for this use.

### Scroll height on a phone (one screen = 844 px)

| View | Height | Screens |
|---|---|---|
| Progress, empty logbook | 3,598 | 4.3 |
| Progress, mid-PPL | 4,086 | **4.8** |
| Progress, mid-PPL, cost panel open | 5,081 | 6.0 |
| Progress, CPL | 5,239 | **6.2** |
| Progress, IFR Group 1 | 3,667 | 4.3 |
| Logbook, 22 flights | 4,460 | 5.3 |
| Logbook, 340 flights | 54,812 | **64.9** |
| Profile, guest / signed in | 2,495 / 2,167 | 3.0 / 2.6 |
| Flight form (its own scroller) | 1,225, with 677 visible | 1.8 |
| At 320 x 568: Progress / Logbook | 4,667 / 4,499 | 8.2 / 7.9 |

### Where things are on Progress, mid-PPL student, phone

| Content | Top (px) | Screens down |
|---|---|---|
| Hours left, requirements met | 476 | 0.6 |
| Price | ~600 | 0.7 |
| Finish date (cut off by the nav bar at 777) | 730 | 0.9 |
| Your next flight (486 px tall) | 935 | 1.1 |
| What's unlocked (exams, flight test) | 1,437 | 1.7 |
| First requirement | 1,700 | 2.0 |
| Experience section (the actual hours) | 2,533 | 3.0 |
| **First progress bar** | **2,592** | **3.1** |
| Flight test requirement | 3,219 | 3.8 |
| Other licences and ratings | 3,381 | 4.0 |

### Taps and keystrokes, from the tab the app opens on

| Flight | Taps | Keys | Swipes | Note |
|---|---|---|---|---|
| Bare minimum (time only) | 4 | 3 | 0 | Tab, Log a flight, Dual, Save |
| **Dual 1.3, with To and landings** | **6** | **8** | **1** | What a careful student does |
| Solo 1.0 | 7 | 8 | 2 | PIC box, then a separate Solo tick |
| Cross-country 2.1 | 7 | 11 | 2 | Time typed twice |
| FTD 1.0 | 5 | 14 | 0 | 3 keys once the device is remembered |

Add one tap on a real phone to dismiss the keyboard before Save (see F8). The flight form has **21 inputs, 14 of them number boxes.** A local dual flight fills one.

### Keyboard and focus (desktop)

| Behaviour | Result |
|---|---|
| Focus moves into the dialog on open | Yes, to Date |
| Focus trapped in the dialog | **No.** Tab leaves after Save; a second Shift+Tab from Date lands on the page behind it |
| Esc closes | Yes, **and discards typed data with no warning** |
| Backdrop click closes | Yes, **and discards typed data** |
| Focus returns to the trigger | **No, it falls to `<body>`** |
| Enter in a field saves | Yes |
| Arrow keys on the Create profile / Sign in `role=tab` control | **Do nothing** |
| `h1` on Logbook / Profile | **None** |
| Page title changes with the tab | No |

### Which on-screen keyboard each field asks for

| Field | Request | Comment |
|---|---|---|
| Time boxes | `inputmode=decimal` | Right, but no ":" on the iOS decimal pad, while the app's own hint offers "1:18" |
| Landings, approaches | `numeric` | Right |
| Date | `type=date` | Native picker; opens already focused |
| Registration, From, To | text, all caps | Right; no `autocorrect=off` or `spellcheck=false` |
| Aircraft type | text | No caps, so "c172" is possible |
| Rates | `type=number`, `decimal` | Right |
| Mark % | `type=number`, `numeric` | Right |
| Email | `type=email`, `email` | Right |

### Font sizes

Nothing below 13 px, and sizes are consistent. Progress is mostly small text: **2,377 characters at 14 px, 1,396 at 15 px**, and very little else. 13 px carries the bottom-nav labels, the Dual/PIC box labels, tile labels and citations. The largest figure on the phone Progress tab is 26 px.

### Speed

The frozen copy is served uncompressed, unlike the published page, so I re-served it gzipped through a throwaway local proxy for these numbers. Code is about 88 KB gzipped, and a first visit measured about 100 KB in all.

| Connection (CPU slowed x4 to x6) | First ever visit | Return visit (service worker) |
|---|---|---|
| Good 4G | 1.7 s | 0.7 s |
| Fast 3G | 1.6 s | 0.6 s |
| Slow 3G | 4.2 s | 1.0 s |
| Very weak signal, 150 kbps | 7.9 s | 1.1 s |

Good. The one gap is a blank page until the script runs on a first visit. 340 flights also ran fine: 199 ms to open the Logbook, 155 ms to open the form. No list virtualisation is needed.

---

## 4. Findings, ranked by how much they hurt real users

### Tier 1: every flight, or every visit

### F1. The flight form makes a student transcribe paper columns

**Who, when:** every student, every flight, standing on an apron.

**Observed.** 21 inputs in a scroller 1,225 px tall. Time goes into a grid laid out by engine class, day or night, and Dual or PIC. Cross-country is a second grid further down, where the same time is typed again. Solo is not a kind of flight: you type in the PIC box, then find a tick box. Landings are at y=1,037, always a swipe away. Actual IMC, FTD and IFR approaches appear on every flight, for every student.

**Judgement.** The tap count is not the problem. Six taps is fine. The problem is the decisions: which cell does this flight go in? That's a paperwork question, asked at the moment the student least wants one. The natural slip, ticking Solo and typing in the first box, produces "Solo needs PIC time on this line", which is correct and tells a new student nothing about what to do.

**Evidence:**
- `src/ui/EntryForm.tsx:268-305`

**Fix.** A quick form on top of the same columns, with today's form one tap away:

```
Log a flight                               Cancel
Today · C172 C-GABC · CYKF → CYKF          (tap to change)

[ Dual ]  [ Solo ]  [ PIC, passengers ]
Time   [  1.3  ] h        (focused, number pad)
Also   [ Night ] [ Cross-country ] [ Hood ]
Landings   –  4  +

Paper columns ›                      [ Save flight ]
```

- Chips write the existing columns. The mapping already exists in `src/rules/next.ts:50-87`.
- Dual writes `seDayDual`. Solo writes `seDayPic` and `solo`. Night moves the time to the night column. Cross-country copies it to the matching XC column and focuses To.
- `To` defaults to `From` (`src/App.tsx:125`).
- Paper columns opens the current form with the same values. An entry that doesn't fit the simple shape opens there directly. The data model and D6/D10 stay intact.
- Target: dual flight in 3 taps and 3 digits.

**Effort: M.**

### F2. You can't log a flight from where the app opens

**Who, when:** everyone, every session.

**Observed.** The app opens on Progress (`src/App.tsx:87`), which has **0** Log a flight buttons. On Logbook the button is at the top and scrolls away: with the list scrolled it's off screen, and re-tapping the Logbook tab does nothing (scrollY stayed 3000).

**Judgement.** The app's main action is two taps from anywhere and in the hard-to-reach top third of the phone when you get there.

**Fix.** A raised **+** in the centre of the bottom nav on every tab (desktop: a primary button in the top bar). FTD and paper totals move into the form's header or a small menu. Add `shortcuts` to `manifest.webmanifest` so long-pressing the home-screen icon offers "Log a flight". Re-tapping the active tab scrolls to top.

**Effort: S.**

### F3. Saving a flight gives nothing back

**Who, when:** every flight. This is the one moment the app can make a student feel good.

**Observed.** The sheet closes, and that's all. Zero status elements or toasts. The new row is at y=891, below the fold. The tile figures change if you remembered them. Signed in, the top-bar badge flicks through Saving, and a guest gets nothing. The student stays on the Logbook, and the numbers they care about are on another tab. Delete has no undo either.

**Judgement.** This is the biggest gap in feel. No confirmation that it worked, and no link between the flight and the goal.

**Evidence:** `src/ui/EntryForm.tsx:186-189`

**Fix.** On save, a sheet or large toast at thumb level for about 6 seconds:

> **1.3 h logged.** PPL: 19.1 h to go, was 20.4. Solo time is next.
> [See progress] [Undo]

The data is already there: `evaluateGoal` before and after. Undo replaces the save and the delete confirm. Animate the bar on Progress when arriving from it.

**Effort: S to M.**

### F4. Save can appear to do nothing

**Who, when:** anyone who misses a required field or makes a cross-country error. The screen gives no sign, so they will tap again and assume it's broken.

**Observed.** Saving with no time puts the error at y=1,282 while the visible area ends at 737. Scroll position does not move, and focus stays on Save. The screenshot is indistinguishable from an untouched form. With cross-country over the flight time, only the red top edge of a box shows and the message is out of sight. A bad-format error appears near the field, but the second error of that attempt is far below.

**Evidence:**
- Code: `src/ui/EntryForm.tsx:180-185` sets errors and returns; `:386-390` puts the time error after Remarks

**Fix.** On a failed save, scroll to and focus the first invalid field. Put the "enter a time" message directly under the Flight time heading. Show a one-line "1 thing to fix" above the footer buttons with `role="alert"`.

**Effort: S.**

### F5. Progress buries the answer

**Who, when:** every student, every visit. "How far am I, what does it cost, what do I fly next" is the product.

**Observed.**
- 4.8 screens long, 545 words in the main card, six separate grey boxes.
- No visual of progress at the top. The first bar is at 2,592 px.
- The hero says only what remains (19.1 h). "25.9 of 45 h done" is three screens down.
- The summary bar on the goal card is requirement-count based: **25% while the student has flown 58% of the hours.**
- Repetition: "40 h private pilot ground school", "Letter of recommendation" and the medical each appear **3 times**, in the gate, the requirement and the exam checklist ("tick it above when you have it").
- 20 citations in the card, each set inline in the running text.
- The dropdown and the page title directly beneath it say the same words.

**Judgement.** Everything here is true and most of it is useful once. A returning student needs three numbers and one suggestion, then the short list of what's unfinished. Finished items deserve to collapse.

**Evidence:** `src/ui/Progress.tsx:80`, `:165-189`

**Fix.** One hero, replacing the dropdown, title, Mark as held, the three tiles and the pace sentence:

```
PPL ▾                                     (page title is the goal switcher)
( ring 58% )   25.9 of 45 h
               at least 19.1 h to go
$5,800 to $12,900 left · Ontario sample rates   Edit
Around January to March 2027, at 2.3 h a week
```

- Next flight: one line and the flight's price. "Why this flight" expands the rest.
- What's unlocked: compact status chips.
- **What's left:** unmet requirements only, with bars, most remaining first. **Done (3)** collapsed. Exam checklists only inside an expanded row.
- Citations as a quiet line under an opened row (keep them everywhere, make them quieter).
- Target: under 2 screens, first bar on the first screen.

**Effort: M to L.**

### F6. A typed flight is easily lost

**Who, when:** phone users on Back; desktop users with Esc or a stray click.

**Observed.** Cancel (there are two, one right next to Save), Esc and a backdrop click all discard typed values with no warning. **Back with the form open left the app's page entirely** (went to `about:blank` in the test). Tabs and forms never add a history entry (`history.length` stayed 2).

**Judgement.** In an installed Android app, Back would close the app and take the flight with it. I simulated this with the browser's Back, not a real installed app.

**Evidence:** `src/ui/EntryForm.tsx:108`, `:211`, `:217`, `:399`.

**Fix.** Track whether the form changed. If it did, ask "Discard this flight?" on Cancel, Esc and backdrop. `history.pushState` when the sheet opens so Back closes the sheet. Keep one Cancel, in the header. Store an in-progress draft in `sessionStorage`.

**Effort: S.**

### F7. Impossible numbers are accepted silently

**Who, when:** anyone who mistypes. On a phone "13" for "1.3" is one missed key.

**Observed.** A **130 h** single flight saved without comment. A flight dated **2030-01-01** saved. An exam mark of **150** counted as passed.

**Judgement.** Hours, money, finish date and next flight all come from these numbers. One typo changes every headline and nothing points to why. This directly hurts the trust the app is built on.

**Evidence:** `src/model/entry.ts:347-367`, `src/ui/Progress.tsx:438-442`

**Fix.** Soft checks that can be overridden: over 8 h on a non-paper line, "13.0 h on one flight? Did you mean 1.3?" with Fix / Keep; a date in the future; mark clamped to 0 to 100.

**Effort: S.**

### F8. The keyboard probably covers Save (check on a real phone)

**Who, when:** every phone user, every field.

**Not observed directly:** Edge's emulation has no on-screen keyboard.

**Inferred from code.** The sheet is `height: 100%` of the layout viewport (`src/styles.css:1790-1795`) and the viewport meta has no `interactive-widget` (`index.html:5`). Chrome on Android (by default) and iOS Safari overlay the keyboard on top of fixed content. So the Save button sits behind it, and a student has to dismiss the keyboard first. At 390 x 844, a 340 px keyboard leaves about 500 px, of which the sheet's own header takes about 60. At 320 x 568 the form body is only 401 px before any keyboard.

**Fix.** Add `interactive-widget=resizes-content`. For iOS, size the sheet from `visualViewport` height through a CSS variable. Keep Save above the keyboard. The quick form in F1 largely solves this by being short.

**Effort: S to M, on real devices.**

---

### Tier 2: often, or badly for some

### F9. The Logbook collapses at tablet and landscape widths

**Who, when:** any iPad in portrait, or a phone on its side. This is the kind of thing a tester screenshots.

**Observed.** From 721 to about 880 px wide the Aircraft and From-To columns have **0 to 64 px**. At 768 "C172 · C-GABC" prints one letter per line and each row is 269 px tall. At 844 (a phone on its side) it's three lines and the route is "CY…". **On desktop the route is truncated at every width** ("CYKF → CY…"): the destination, the only part that differs between flights, is what gets cut.

| Width | Aircraft column | Route column | Row height |
|---|---|---|---|
| 720 (phone layout) | 654 | 654 | 157 |
| 721 | 0 | 0 | 269 |
| 768 | 1 | 1 | 269 |
| 844 | 44 | 34 | 89 |
| 960 and up | 109 | 85 (truncated) | 50 |

**Evidence:**
- `src/ui/Logbook.tsx:80`, `src/styles.css:1513-1515`, `:1652`

**Fix.** Move the Logbook's switch to the card layout from 720 up to about 1000 px. At wider sizes, give the route a floor of about 120 px and widen `.main` on this tab, or drop FTD and Inst columns when empty (Co-pilot already works that way).

**Effort: S.**

### F10. The logbook doesn't scale

**Who, when:** from about 30 flights on, and anyone looking for one flight.

**Observed.**
- The first flight row starts at y=891 with the guest banner and about 737 without it, and the nav covers from 777. **No complete flight is visible on the Logbook's first screen either way.** Above it: three buttons (one a one-time paper import that stays forever), eight tiles, two folds.
- Rows are 136 to 159 px, about 4 per screen.
- 340 flights is **65 screens**. Reaching the middle is about 46 flicks at 600 px each. No search, filter or month grouping.
- Delete sits 12 px from Edit on every row, and its message names only a date. Four flights on one day all read "Delete the 2026-11-08 entry?"
- Leaving the tab and coming back loses your place.

**Evidence:** `src/ui/Logbook.tsx:122-194`

**Fix.**
- Summary strip of three (Total, PIC, Dual) with "All totals" expanding the rest.
- Rows of about 64 px: `Nov 8 · C172 C-GABC · CYKF → CYSN` and on the right `Dual 1.3`. Tap to edit; Delete moves inside the edit form, with Undo (F3).
- Month headers with that month's total. Search box, chips for Dual / Solo / XC / Night.
- Search and filter were already on the roadmap. I would move them up.

**Effort: M.**

### F11. A first visit asks for a password before showing anything

**Who, when:** every new student, deciding whether to trust this.

**Observed.** The hero takes 362 px, then it's a sign-up form. The Create profile button straddles the fold (812 to 856 of 844). Continue without a profile is at 876. Nothing shows what the app looks like: the three points start at 1,046. On a slow server, the "waking up" message is **below the fold**: on screen the student sees only a disabled "One moment…" for up to a minute.

**Judgement.** The value here is unusually easy to show. A picture of the 19.1 h and $5,800 card would sell it better than the three bullet points. The share image has a gauge that the app itself lacks.

**Fix.** Keep recommending a profile (D27). Shrink the hero, add a real preview of the Progress card, then put two equal choices above the fold: Create profile and Try it first. Once they've logged something, ask for the profile in the moment after the save ("Keep this flight safe"). Move the waking hint above the button or into it.

**Effort: S for the hint, M for the rest.**

### F12. The first run doesn't ask who you are

**Who, when:** every new user, licensed pilots most.

**Observed.** After sign-up everyone is a PPL student. A licensed pilot has to discover both Profile (tick what you hold) and the Working on dropdown. Meanwhile a **"Mark PPL as held" button is the only button in the header of the Progress card**, shown to people working toward that licence. One tap flips the whole card to "You hold this" with no check (it can be undone). "Change this in Profile" is grey text, not a link.

**Evidence:** `src/ui/Progress.tsx:135-137`, `:143-144`

**Fix.** One screen after sign-up or skipping: "Where are you?" Starting my PPL / Partway through / I already hold a licence (then which, with dates). Then the paper totals, and province for rates and tax. Move Mark as held out of the header to a quiet link at the end of the card, still naming what it marks (D19).

**Effort: M.**

### F13. Banners and repeated prompts take the top of every screen

**Who, when:** every guest, and every signed-in user who hasn't opened the confirmation email.

**Observed.** The banner is 138 px tall on every open. As a guest there are **two identical Create profile buttons 150 px apart**. "Later" is forgotten on reopen (banners: 0 after Later, 1 after reload), because it's `useState` (`src/App.tsx:89-91`). On a brand-new account a confirmation banner sits above the "Start with your hours" call. The copy tells phone users to **create a profile so they "can use it on your phone too"** (`src/App.tsx:202`).

**Fix.** At most one banner at a time, by priority. Make it a slim 44 px strip. Remember "Later" for 14 days in `localStorage`. Remove the banner's button when the top-bar one is showing. Rewrite: "Your logbook is only on this device. Save it to a free profile so you can't lose it."

**Effort: S.**

### F14. The headline price is an Ontario sample

**Who, when:** every student outside Ontario, and anyone who doesn't notice.

**Observed.** The largest number on the screen is calculated from a sample $220 + $90 + 13% HST. It's labelled in 14 px grey. Rates live inside a section titled "How the cost is worked out", reached by a 21 px tall link. The panel adds about 1,000 px of grey text around the fields.

**Judgement.** Money is the main worry. A big confident figure resting on someone else's rates is the wrong way round. The disclosure is honest but too quiet.

**Evidence:** `src/ui/Cost.tsx:33-47`, `src/model/profile.ts` (`SAMPLE_RATES`)

**Fix.** Ask for province at first run, for tax and a regional sample. Put "sample rates" in the figure's own label. Give rates a dedicated sheet from an Edit link.

**Effort: S to M.**

### F15. Terms are never explained

**Who, when:** new students, on their first few days.

**Observed.** PIC, FTD, Hood, Actual IMC, IFR approaches, XC, Inst, Ldg D/N, PPAER, CPAER, INRAT, FTU, VFR OTT all appear with no expansion. FTD's own hint ("instrument ground time") doesn't say what the letters stand for. The rows read `Dual 1.3   Ldg D/N 4/0`.

**Judgement (no user test).** Students learn "dual" within days. Solo = PIC is exactly the point they won't know yet. Actual IMC and IFR approaches are noise until an IFR goal exists.

**Fix.** Plain labels on the quick form. A tap-for-meaning on abbreviations. Spell out exams on first use ("PPAER, the private pilot written exam"). Rows say `4 landings`. Hide instrument boxes until the pilot has an IFR goal or opens them.

**Effort: S.**

### F16. Nothing marks an achievement

**Who, when:** first solo, each requirement met, finishing a licence. These are the reasons people remember an app.

**Observed.** With all 12 PPL requirements met the screen says **"0 h / hours all met"** and "12 / 12", with the same "Mark PPL as held" button as before. The first-solo flight I seeded looked like any other row.

**Fix.** A full-width state on completion: "Every PPL requirement met. Next: your flight test", with Mark as held as the primary action. A small moment for first solo, each requirement, and halfway. Copy: "All hours flown".

**Effort: S to M.**

### F17. Two goal switchers, and one looks broken

**Who, when:** pilots comparing goals.

**Observed.** A dropdown at the top and nine cards at the bottom do the same thing. Tapping a card from the bottom changes the whole page above while the heading stays **3,846 px off screen**. All you see is a border move.

**Evidence:** `src/ui/Progress.tsx:60-61`

**Fix.** One switcher: the page title, opening a bottom sheet of goals with their progress. Remove the grid from the page.

**Effort: S.**

### F18. Trust details are in the wrong place

**Who, when:** students relying on a number, and anyone checking it.

**Observed.**
- "Text current to NSA 2025-008" and "check with your flight training unit" are in the Profile footer only.
- The nightly check of Transport Canada's text is invisible.
- Interpretation notes look like facts, in the same small grey.
- The exam says "60% overall and in each of the four subjects", and offers **one** mark box.
- Ticking an exam turns it green before any mark is entered.

**Judgement.** The instructor review of the numbers is still open on the roadmap. Until then, the app should say so where the numbers are.

**Evidence:** `src/ui/Profile.tsx:85-97`, `src/ui/Progress.tsx:428-445`

**Fix.** A line under each goal title: "Standard 421.26 · current to NSA 2025-008 · checked nightly". A visible "Our reading, ask your FTU" tag for interpretations. Four subject marks, or a label that doesn't promise them. Treat a blank mark as ticked but not yet passed.

**Effort: S.**

---

### Tier 3: accessibility, polish, account

### F19. Dialog and form accessibility

**Observed.** See the keyboard table. Focus escapes the dialog and lands on page controls behind it. Focus doesn't return. Field errors have no `aria-describedby` (0 of 1 invalid fields) and aren't announced; only the form-level error has `role=alert`. `role=tab` controls have no arrow keys or panels. No `h1` on Logbook or Profile.

WCAG, by my reading (axe doesn't test these): 2.4.3 focus order, 1.3.1 errors not tied to their fields, 4.1.3 status messages.

**Evidence:** `src/ui/EntryForm.tsx:106-111`, `:212`.

**Fix.** Use native `<dialog>` with `showModal()`: focus trap, Esc, inert background and focus return for free. Link errors with `aria-describedby`. Use `aria-pressed` buttons in place of `role=tab`. Add `h1` per tab and set `document.title`.

**Effort: S to M.**

### F20. Contrast failures

**Observed.** Dark-mode delete button is white on `#f87171`, 2.76:1. Unmet status rings are 1.27:1, and the two ring styles (pale = worked out from your log, dark = tick me) are a distinction nobody is told about.

**Evidence:** `src/styles.css:463-467`, `:1156`

**Fix.** Dark ink on the dark-mode danger button. Show calculated items as a small progress ring or bar, and tickable ones as a clear square checkbox, so the shape tells you which is which.

**Effort: S.**

### F21. Small tap targets

**Observed.** See the table. `.link` has 4 px padding (`src/styles.css:480-488`) and the rates link has none (`:909-911`).

**Fix.** Make `.link`, `.toggle`, `.btn.small`, `.segmented button` and `.inline-field` controls at least 44 px on phones. Edit/Delete go away with F10.

**Effort: S.**

### F22. Legibility in bright sun

**Judgement, not tested outdoors.** AA contrast is met, but small grey text on grey tiles is the worst case outside. Bars are 6 px tall with a 1.14:1 track. Dual/PIC labels are 13 px grey.

**Fix.** Body 16 px; labels at 14 px or more in full-strength text; darken `--muted` to about `#46505c`; bars 8 to 10 px with a darker track.

**Effort: S.**

### F23. The visual design reads as a tool, not a product

**Judgement, from the screenshots.**
- Inside the app, everything has the same weight. Grey page, white card, grey tiles inside it, grey panels inside those. Nothing leads.
- The key figure on a phone is 26 px, close to the headings around it.
- The form draws six outlined boxes around small groups of inputs.
- The accent colour appears everywhere and so means nothing.
- On tablet and desktop the three stat tiles have large blank areas, because the price tile sets the height.
- At 721 to about 900 the top bar wraps ("HOURS / TO GO", "Create / profile"). At 320 the name truncates to "HOURS TO …" and airport codes are clipped.

The welcome screen shows the identity working. The inside doesn't carry it.

**Fix.** One hero per screen. Hero figures at 48 px or more on a phone, and a clear type scale (for example 13 / 15 / 17 / 22 / 34 / 48). Remove nested boxes in favour of space and rules. Colour reserved for status and one action. Brief, purposeful motion on save and progress. Do the tokens first, since batches B to D rebuild these screens anyway.

**Effort: L, spread over batches.**

### F24. Account actions end in silence

**Observed.**
- After deleting a profile, there's no message: you land on a blank guest Profile tab (`[role=status]` empty).
- After sign-up as a guest with 22 flights, nothing says they moved.
- No show-password control.
- "Export your logbook first" is plain text, with the Export button two cards away.
- Sign-up errors are native browser bubbles.

**Fix.** A "Your profile is deleted" confirmation. "22 flights are now in your profile". An eye toggle. An Export button inside the danger zone. Inline validation matching the rest of the app.

**Effort: S.**

### F25. Smaller things

- The form title reads "New: Flight". Use "Log a flight".
- The placeholder `CYSN` in From and To looks like data.
- Date opens already focused with the year highlighted. On iPhone this may pop the date wheel immediately (a guess; check on a device). Focus nothing, or focus Time.
- Dates are ISO everywhere in the list. "Nov 8" under a month header is friendlier.
- `Reload` always lands on Progress, and tab scroll positions are lost.
- "Offline" is shown when the device is online but the server is down. Harmless, but "Can't reach the server" would be accurate.
- No install hint anywhere, though the product assumes a home-screen install and iOS can clear a browser's storage after 7 days (roadmap). A one-time "Add to Home Screen" prompt after the first logged flight.
- Blank page during the first load. An inline splash in `index.html` costs almost nothing.
- By-aircraft-type table hides the FTD column off the right edge at 390 with no cue.
- Every-column fold shows Multi-engine 0.0 for pilots who've never flown one.

**Effort: S each.**

---

## 5. Proposed order of work

**The five changes that would most transform how the app feels:**

1. **Quick log with a + on every tab** (F1, F2). The thing people do most goes from a form to a gesture.
2. **The "logged" moment, with Undo** (F3, F16). The first time the app gives anything back.
3. **A Progress hero and a short "what's left" list** (F5, F17). Answers the question in one glance.
4. **A compact, searchable logbook** (F10). Stops being a wall.
5. **A first run that knows who you are** and shows the product before asking for a password (F11, F12, F14).

| Batch | Contents | Why here | Size |
|---|---|---|---|
| **A. Stop the bleeding** | F4, F6, F7, F9, F13, F19, F20, F21, F25 | Real bugs and data loss; all small | 3 to 4 days |
| **B. The flight** | F1, F2, F3, F8, start of F23 tokens | The core loop; test on real phones | About 1 week |
| **C. Progress at a glance** | F5, F16, F17, F14 | Depends on the tokens from B | About 1 week |
| **D. A logbook that scales** | F10, F15 row wording | Independent of C; could run in parallel | 3 to 4 days |
| **E. First run and trust** | F11, F12, F15, F18, F24 | Best done once the screens it shows are final | About 1 week |
| **F. Finish** | Rest of F22 and F23 | A last visual pass | 2 to 3 days |

Batch A and batch B come before the 10 to 15 classmates test on the roadmap. Watching those testers log one real flight on their own phones would validate more than anything in this report.

---

## 6. What would make it excellent

From general familiarity with good logbooks and tracking apps, not tested for this audit. Pilot logbooks earn loyalty by making the repeated flight nearly free. Fitness apps do it with a single ring and a satisfying summary after the activity. This app has the data for both.

1. **A "Landed" shortcut.** Long-press the icon, and it opens the quick form with last flight's details, ready for one number. Or a Start / Landed timer, or Hobbs in and out. Under ten seconds, on the apron.
2. **"I flew this" on Your next flight.** A single tap that opens the form already filled in with that kind of flight. The suggestion becomes the input, closing the loop between the app's best idea and its most frequent task.
3. **A flight plan instead of a checklist.** Training drawn as a route with waypoints (first solo, written exam, 35 h for the flight test, flight test), with the student's position on it. It suits the cockpit identity and shows at a glance what a list of 12 requirements cannot.
4. **A what-if slider for pace.** "If you fly twice a week: done by February, about $X." It speaks directly to the money worry, and the pace and price engines already exist.
5. **Shareable milestone cards.** "First solo at 14.2 h" as an image in the app's style. Student pilots will post these, and it's a free advertising channel for the launch on the roadmap.

---

## 7. Limits of this audit

**Not tested:** a real iPhone or Android device, a real on-screen keyboard, native date pickers, sunlight, a screen reader, or any actual student. Anything marked as a guess or inferred needs a device check. Judgements about what students understand are mine, not user research.

**Where the fixes touch recorded decisions** (read after the findings were written):

- **D6, D10 (paper columns, Solo tick).** F1 keeps both. It adds a faster way in, and the columns stay as the record and as the full form. D10 says not to go back to separate lines for solo time, so the quick form must fall through to columns for a mixed flight, not force a split.
- **D18 (Progress shows what's unlocked at top, every requirement below).** F5 changes this. Requirements remain one tap away, but finished ones collapse.
- **D19 (buttons name what they act on).** F12 moves Mark as held and keeps its wording.
- **D27 (a first visit recommends a profile, at the owner's request).** F11 keeps the recommendation and changes what comes before it, and offers the profile again at the point it's most persuasive.

The scripts, raw measurements and screenshots were kept outside the repository.
