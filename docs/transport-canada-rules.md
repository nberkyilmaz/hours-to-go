# Transport Canada rules as read

Source: CAR Standard 421, Flight Crew Permits, Licences and Ratings, on tc.canada.ca:
<https://tc.canada.ca/en/corporate-services/acts-regulations/list-regulations/canadian-aviation-regulations-sor-96-433/standards/standard-421-flight-crew-permits-licences-ratings-canadian-aviation-regulations-cars>

Read on 2026-10-20; the page text was current to **NSA 2025-008, effective 2025-12-17**. When the
standard changes, re-read the paragraphs below and update `src/rules/goals.ts` and this file
together. To re-read it quickly: download the page, strip the HTML to text, and search for the
section numbers (`421.26 Aeroplanes - Requirements` and so on).

Each item is listed as the standard says it, followed by what the app does with it.

---

## Exam and flight-test prerequisites (421.13, 421.14)

**Writing an exam, 421.13(4)** (amended 2024-10-10):

- (a) PPL: 5 h flight time in the same category. **App:** PPAER unlocks at 5 h flight time.
- (b) Class 4 instructor: 25% of the flight training, and all ground school. **App:** 7.5 of the 30 h,
  plus the ground-school tick-off.
- (d) Instrument rating: **5 h of instrument flight or ground time.** **App:** actual + hood + FTD ≥ 5 h.
- (f) Everyone else: 25% of the total flight experience. **App:** CPL 50 h, ATPL 375 h.
- 421.13(1): a medical meeting the standard for the licence or rating. **App:** Category 3 or 1
  for PPAER and INRAT; Category 1 for CPAER, SAMRA, SARON and AIRAF.
- 421.13(2): photo ID. **App:** a reminder under each exam.
- 421.13(3): a recommendation letter dated within 60 days before the exam, usable once. (a) PPL, CPL
  (and gyroplane): from the flight school or the instructor responsible for training, saying ground
  school is finished and the knowledge is sufficient. (b) Class 4: from the ground training
  instructor. Not required for INRAT, SAMRA or SARON. **App:** a tick-off for PPAER, CPAER and AIRAF
  that stops counting after 60 days and shows as used once the exam is passed.

All of these show in a "Can you write the … yet?" checklist under each exam, and in the
"Write the …" card at the top of the page.

Owner's belief before this was read: INRAT needed about 20 of the 40 instrument hours. The current
text says 5. Older guides and some schools may still say otherwise.

**Taking a flight test, 421.14(4):**

- (a) PPL: 35 h of the total experience. **App:** 35 of the 45 h of training.
- (c) Other licences: 75% of the total experience. **App:** CPL 150 h, ATPL 1125 h. 421.14(3)(b) also
  needs the CPL written passed first; the app includes CPAER in that gate.
- (d) Instrument and instructor ratings: every knowledge and experience requirement. **App:** the
  gate lists whatever is still open.

## Private Pilot Licence — Aeroplane (421.26)

- Age 17; Category 3 medical (1 also accepted). **App:** medical only; age not tracked.
- (3) 40 h ground school; PPAER with 60% overall and in each of 4 subjects.
- (4)(a) 45 h flight training, up to 5 h of it in an approved simulator or FTD.
  **App:** dual + solo + min(FTD, 5 h).
- (4)(b)(i) 17 h dual, including 3 h cross-country and 5 h instrument time (up to 3 h ground).
  **App:** dual; dual cross-country; dual instrument + min(FTD, 3 h).
- (4)(b)(ii) 12 h solo, including 5 h solo cross-country with one flight of at least 150 NM and full-stop
  landings at 2 points other than the departure. **App:** solo; solo cross-country; the 150 NM flight
  is a tick-off.
- (5) Flight test within 12 months before applying.

## Night Rating — Aeroplane (421.42(1))

- (a) 20 h of pilot flight time in aeroplanes, including:
  - 10 h night: 5 h dual including 2 h dual night cross-country; 5 h solo including 10 takeoffs,
    circuits and landings.
  - 10 h dual instrument time, up to 5 h of it ground time, **in addition to** the 10 night hours.
- (b) A qualifying flight with an inspector or a qualified instructor.
- **App:** the 20 h total isn't shown as its own line (the night and instrument items make it up).
  It counts all dual instrument time in the log, including PPL hood time, and notes that the school
  should confirm. It can't see overlap between night and instrument time inside a line.

## VFR Over-the-Top (421.44)

- 15 h dual instrument time, up to 5 h ground; knowledge and skill to the VFR OTT standard.
- (5) An instrument rating holder gets it on request. **App:** the whole goal is credited.

## Commercial Pilot Licence — Aeroplane (421.30)

- Age 18; Category 1 medical.
- (3) 80 h ground school; CPAER 60% overall and in each of 4 subjects.
- (4)(a)(i) 200 h flight time in aeroplanes, including 100 h PIC with 20 h PIC cross-country.
- (4)(a)(ii) **After the PPL is issued**, 65 h of commercial flight training:
  - (A) 35 h dual: 5 h night including 2 h night cross-country; 5 h cross-country (may include the
    night cross-country); 20 h instrument **in addition to** the night and cross-country, up to 10 h
    of it in a simulator or FTD.
  - (B) 30 h solo in VFR: 25 h emphasising general flying skills, including a cross-country of at
    least 300 NM total with full-stop landings at 3 aerodromes other than the departure, one at
    least 250 NM straight-line from it (150 NM if flown on the island of Newfoundland); 5 h solo
    night with 10 takeoffs, circuits and landings.
- (5) Flight test within 12 months before applying.
- (6) Without the night experience the licence is restricted to day flying.
- (7)(b)(vi)(A) A PPL with a night rating meets the night dual and solo items, **provided the 35 h
  dual and 30 h solo are met**. **App:** credits the four night items when the night rating is held.
- (7)(c) An aeroplane instrument rating meets the 20 h dual instrument. **App:** credited.
- **App:** the after-PPL window is described in [decisions.md](decisions.md) (D11). Solo means alone on
  board; some schools may read the 30 h "solo" more loosely, so check with the FTU.

## Multi-engine Class Rating (421.38(3))

- Skill only: a flight test in a multi-engine aeroplane. No minimum hours in the standard.
  **App:** shows multi-engine time as information; the flight test is a tick-off.

## Instrument Rating (421.46)

- (1) Groups: 1 for all aeroplanes when tested in a multi-engine aeroplane; 2 for centre-line thrust
  and single-engine (tested in centre-line thrust); 3 for single-engine (tested in single-engine);
  4 for helicopters. **App:** Groups 3 and 1 only. Group 1 adds "multi-engine class rating held",
  because the test is flown as PIC of a multi-engine aeroplane.
- (2)(a) INRAT, 70% or better.
- (2)(b)(i) 50 h cross-country **as PIC** in aeroplanes or helicopters, 10 h of it in the category.
  **App:** PIC cross-country (solo or PIC columns); dual cross-country never counts.
- (2)(b)(ii) 40 h instrument time, up to 20 h ground time, including:
  - (A) 5 h dual instrument flight time from a flight instructor
  - (B) 5 h in aeroplanes (for Groups 1–3)
  - (C) 15 h dual instrument flight time from a qualified person (425.21(9))
  - (D) a dual cross-country of at least 100 NM in actual or simulated IMC, on an IFR flight plan,
    with an approach to minima at two different locations
  **App:** 40 h = actual + hood + min(FTD, 20 h). (A) and (C) are one line: 15 h dual instrument
  in the aircraft, which also meets (B) for an aeroplane-only log. FTD time is **not** counted in
  the 15 h; the note says to ask the school. (D) is a tick-off.
- (2)(c) Flight test (Standard 428 Schedule 8) or an IFR PPC.

## Flight Instructor Rating — Class 4 Aeroplane (421.69)

- (1)(a) Before flight training: hold a CPL or ATPL, and 200 h total including 20 h instrument time,
  at least 10 h of it in flight.
- (1)(b) Before ground school: CPL written and flight test passed.
- (2) 25 h instructor ground school; AIRAF 70% or better.
- (3) 30 h dual flight instruction, up to 5 h in a simulator or FTD, including 5 h of training in
  teaching instrument flight skills. **App:** counted from the course start date the pilot sets; the
  5 h teaching-instrument item is a tick-off.
- (4) Flight test.

## Airline Transport Pilot Licence — Aeroplane (421.34)

- Age 21; Category 1 medical.
- (3) SAMRA, SARON and INRAT, each 70% or better.
- (4) CPL training requirements met and not day-restricted; 1500 h total, 900 h in aeroplanes,
  including:
  - (a) 250 h PIC in aeroplanes (up to 100 h of it PIC under supervision), including 100 h
    cross-country, 25 h of it at night
  - (b) 100 h night as PIC or co-pilot, 30 h of it in aeroplanes
  - (c) 100 more hours of cross-country as PIC, or 200 h as co-pilot, or a mix
  - (d) 75 h instrument time, up to 25 h ground and 35 h in helicopters; ground time doesn't count
    toward the 1500 h
- (5) Skill test to the Group 1 standard in a two-crew multi-engine aeroplane, or an IFR PPC.
- **App:** PIC under supervision isn't tracked. (c) counts PIC cross-country beyond the first 100 h
  only, because the personal log has no co-pilot cross-country column.

## What the personal log looks like (421.08)

The standard's own description of a log (used for a lost-log affidavit) lists hours by day and night
on single and multi-engine aircraft as PIC, co-pilot and dual; cross-country by day and night as PIC,
co-pilot and dual; instrument flight time and instrument ground trainer time. The owner's paper log
has those columns except co-pilot cross-country, and the app follows the owner's log.

## Not modelled

Recreational permit, gliders, balloons, gyroplanes, helicopters, Group 2 and 4, seaplane and
landplane ratings, type ratings, instructor Classes 1–3, aerobatic ratings, foreign and military
credits, recency (401.05), medical validity periods, written-exam validity windows.
