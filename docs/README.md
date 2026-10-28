# Project documents

Read these before changing anything. They record what the app does, why it is built the way it
is, what went wrong along the way, and what is still open.

| Document | Read it for |
| --- | --- |
| [worklog.md](worklog.md) | The project phase by phase: what was built, what feedback changed it, what broke and how it was fixed. Start here. |
| [decisions.md](decisions.md) | Every design decision with its reasons and the alternatives that were turned down. Check before reversing one. |
| [architecture.md](architecture.md) | File map, data model, how a logbook line becomes requirement progress, the API, storage, and the screens. |
| [transport-canada-rules.md](transport-canada-rules.md) | The Standard 421 requirements as read from the source, paragraph by paragraph, and every place the text needed interpreting. |
| [runbook.md](runbook.md) | Running, testing, building, checking the UI in a real browser, and the problems you will hit on this Windows machine. |
| [deploy.md](deploy.md) | Putting it live at nberkyilmaz.com/hours-to-go: GitHub Pages, Render, Neon, the domain, step by step, and what each free plan costs in other ways. |
| [roadmap.md](roadmap.md) | Open decisions waiting on the owner, next work, known limits, and what must happen before real students use it. |

## State at the last update (2026-10-27)

- Everything in the root README works: logbook with paper-log columns, progress for nine
  Transport Canada licences and ratings, profiles (email and password) with a guest mode,
  phone layout, home-screen install.
- `npm run typecheck` is clean and `npm test` passes 83 tests in 5 files.
- Source at <https://github.com/nberkyilmaz/hours-to-go> (public, branch `main`).
- Ready to go live at <https://nberkyilmaz.com/hours-to-go/> (page on GitHub Pages, API on
  Render at `hours-to-go-api.nberkyilmaz.com`, Postgres on Neon), but not deployed yet. The steps
  waiting on the owner's accounts are at the top of [roadmap.md](roadmap.md).
- The logbook-photo import was considered and dropped.
