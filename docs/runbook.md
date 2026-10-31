# Runbook

Everything here was done on the owner's machine: Windows 11, Node 22.23, npm 10.9, Git Bash and
PowerShell, Microsoft Edge and Chrome installed.

## First time

```sh
cd ~/Desktop/hours-to-go
npm install
```

Node must be 22.13 or newer. Nothing else to install: the local database is PGlite (Postgres
compiled to WebAssembly), which comes with `npm install`.

## Develop

Two terminals:

```sh
npm run dev:api     # API on http://127.0.0.1:8787, restarts on server changes
npm run dev:web     # app on http://localhost:5173, /api proxied to 8787
```

Without `dev:api` the app still opens: a new browser on the welcome screen, a browser that was
signed in as a guest with a "can't reach the server" banner.

**Password-reset emails** aren't sent in development: `dev:api` prints them in its terminal,
link and all (`http://localhost:5173/#reset=…`). Open the link in the browser to try the reset
screen.

**On a phone on the same Wi-Fi:** run `npm run dev:web -- --host` and open the "Network" address it
prints. Session cookies aren't marked Secure in development, so signing in works over plain http.

**Local data:**
- Profiles: `data/pglite/` (git-ignored), a PGlite database folder. Delete the folder to start
  over, with the server stopped. `DATABASE_URL=memory://` gives a throwaway one instead.
- A browser that has signed in keeps `hours-to-go/signed-in` in localStorage. Without it the app
  opens as a guest without calling the API at all (decision D26).
- A browser that has been past the welcome screen keeps `hours-to-go/welcomed` (D27). Remove it,
  with an empty guest log, to see the welcome again.
- Guest logbook: the browser's localStorage key `hours-to-go/v1`. Clear site data, or use
  Profile → "Erase this device's logbook".

## Check

```sh
npm run typecheck   # both tsconfigs; must be clean
npm test            # 98 tests: rules, logbook model, server API, first visit and guest, signed in
```

The server tests run in Node (`// @vitest-environment node` at the top of the file), each on a
fresh in-memory PGlite (about a second apiece, most of it PGlite starting). The web tests run in
jsdom with `fetch` stubbed.

To run the API tests against a real Postgres server as well, which is what CI does, set
`TEST_DATABASE_URL`. **They drop the tables first**, so only ever use a throwaway database:

```sh
docker run -d --rm --name htg-pg -e POSTGRES_PASSWORD=htg -p 5434:5432 postgres:18
TEST_DATABASE_URL=postgres://postgres:htg@127.0.0.1:5434/postgres npm test
```

Without Docker running, PGlite can stand in as a server for the `pg` path:
`npx @electric-sql/pglite-socket` from a scratch folder (`pglite-server --port 5435
--max-connections 10`), then `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5435/postgres`.

## Build and run as in production

```sh
npm run build                                                  # typecheck, then vite build to dist/
NODE_ENV=production DATABASE_URL=memory:// PORT=8787 npm start # Git Bash syntax
```

In PowerShell: `$env:NODE_ENV='production'; $env:DATABASE_URL='memory://'; $env:PORT='8787'; npm start`.

| Variable | Default | |
| --- | --- | --- |
| `PORT` | 8787 | |
| `HOST` | 127.0.0.1, or 0.0.0.0 when production | |
| `DATABASE_URL` | `data/pglite`, but required in production | `postgres://…`, a PGlite folder, or `memory://` |
| `ALLOWED_ORIGINS` | none | origins allowed to call the API with cookies, comma-separated |
| `NODE_ENV` | | `production` marks the cookie Secure, so the site must be served over HTTPS |

To build the page as it is published: `VITE_BASE=/hours-to-go/ VITE_API=https://hours-to-go-api.nberkyilmaz.com npm run build`.
In Git Bash, put `MSYS_NO_PATHCONV=1` in front, or Git Bash rewrites `/hours-to-go/` into
`/Program Files/Git/hours-to-go/` and every link in `dist/index.html` breaks. CI and Pages run on
Linux and aren't affected. Putting it live is in [deploy.md](deploy.md).

**Restart the server after every build.** `@fastify/static` registers one route per file in `dist/`
when it starts, so new hashed asset names 404 until it restarts.

## Checking the UI in a real browser

The jsdom tests can't see layout. Before calling a UI change done, open it at desktop size and at
phone size (390×844 with touch). Three real bugs were only found this way. The privacy page is at
`/privacy/` on the dev server, and `/hours-to-go/privacy/` when published.

What was used: `playwright-core` driving the installed Edge, from a scratch folder outside the
project so the project doesn't depend on it.

```sh
mkdir -p ~/scratch/pw && cd ~/scratch/pw && npm init -y && npm install playwright-core@1
```

```js
// shoot.mjs: node shoot.mjs http://127.0.0.1:8799 ./shots
import { chromium } from 'playwright-core';
const [, , base, out] = process.argv;
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await phone.newPage();
p.on('pageerror', (e) => console.error(e));
await p.goto(base);
await p.getByRole('button', { name: 'Continue without a profile' }).click(); // a new browser: welcome first
await p.getByRole('button', { name: 'Logbook', exact: true }).click();
await p.getByRole('button', { name: 'Log a flight' }).click();
const save = await p.getByRole('button', { name: 'Save', exact: true }).boundingBox();
console.log('Save button bottom:', save.y + save.height, 'of 844');   // must be on screen
await p.screenshot({ path: `${out}/phone-form.png` });
await browser.close();
```

Two things that make a script lie:
- `getByText('Saved to your profile')` matches regardless of case and inside longer text, so it
  finds "…saved to your profile, so it's safe…" on the welcome screen at once. Pass
  `{ exact: true }`.
- The tabs fade their colours over 0.15 s. A screenshot taken straight after a click shows the old
  tab still lit; wait a moment first.

Run it against a production build on a spare port with a throwaway database:

```sh
npm run build
DATABASE_URL=memory:// PORT=8799 node --import tsx server/main.ts
```

**The published arrangement** (page and API on different hosts of one site) can be checked the
same way. Map two names to this machine in the browser, serve the page under `/hours-to-go/`,
and point the API's `ALLOWED_ORIGINS` at it:

```js
chromium.launch({ executablePath: '…/msedge.exe',
  args: ['--host-resolver-rules=MAP nberkyilmaz.test 127.0.0.1, MAP hours-to-go-api.nberkyilmaz.test 127.0.0.1'] });
```

```sh
MSYS_NO_PATHCONV=1 VITE_BASE=/hours-to-go/ VITE_API=http://hours-to-go-api.nberkyilmaz.test:8799 npx vite build
DATABASE_URL=memory:// ALLOWED_ORIGINS=http://nberkyilmaz.test:8798 PORT=8799 node --import tsx server/main.ts
# and any static server mapping /hours-to-go/* to dist/ on port 8798
```

Then sign up at `http://nberkyilmaz.test:8798/hours-to-go/`, log a flight, reload, and sign in
from a second browser context. Requests from Playwright's own `request` API use Node's resolver,
not the browser's, so fetch from inside the page instead.

Tips from doing this:

- Fill boxes by their accessible names, e.g. `getByLabel('Single-engine day Dual')`,
  `getByLabel('Takeoffs & landings Night')`, `getByLabel('After your PPL: Solo', { exact: true })`.
  Each box has a hidden group prefix for screen readers, and the same names work in tests.
- The All / None / Some answers are pills whose radio buttons are hidden behind the labels. Click the
  label (`group.locator('label', { hasText: 'All of it' }).click()`); clicking the radio itself fails.
- Several buttons contain "Logbook" ("Add totals from your paper logbook"), so use `exact: true` for
  the tabs.
- Full-page screenshots at phone size show the fixed bottom tab bar in the middle of the page. That
  is how full-page capture works, not a bug.
- Also take a dark-mode look: `colorScheme: 'dark'` on the context.

## Problems you will hit

**Port already in use / an old server still answering.** On Windows, stopping the shell that ran
`npx tsx …` can leave `node.exe` running. Find it and stop it only if it is this project's server:

```powershell
$c = Get-NetTCPConnection -LocalPort 8799 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) { (Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)").CommandLine }
# if it ends in server/main.ts:
Stop-Process -Id $c.OwningProcess
```

Starting the server as `node --import tsx server/main.ts` instead of `npx tsx` leaves one process,
which stops cleanly.

**Typecheck errors in `vite.config.ts`.** Vitest 2 ships its own Vite 5 types, which clash with Vite 6
under `exactOptionalPropertyTypes`. The file is deliberately in neither tsconfig.

**Git Bash rewrites paths.** In Git Bash, an environment variable or argument that starts with `/`
is turned into a Windows path, so `VITE_BASE=/hours-to-go/ npm run build` links the assets at
`C:/Program Files/Git/hours-to-go/`. Put `MSYS_NO_PATHCONV=1` in front, or build from PowerShell.
With it, any other path must be a Windows one (`C:/Users/…`): a `/c/Users/…` argument is then
taken as `C:\c\Users\…`.

**Port 8787 is departure-brief's too.** Its dev server listens on the same port. If it's running,
start this API on another (`PORT=8797`) and build the page with `VITE_API` pointing there, or stop
that one first.

**Long inline scripts in Git Bash.** Very long here-documents passed to `bash -c` sometimes fail with
"unexpected EOF while looking for matching `''". Write the script to a file and run the file.

**`npm install` warnings.** A deprecation warning for an old `glob` comes from a dependency's
dependency; it is harmless.

## Before committing

- `npm run typecheck` and `npm test` clean.
- Look at UI changes in a browser at phone size.
- `git status` shows no `data/`, `dist/` or exported `hours-to-go-*.json` files (all git-ignored; the
  exports contain personal flight records).
- Files keep LF line endings. `core.autocrlf` is on in this Git install, so a checkout writes CRLF;
  that's harmless for commits but breaks scripted find-and-replace on the files.
- Commits use this repo's identity, `Berk Yilmaz <91981362+nberkyilmaz@users.noreply.github.com>`,
  the GitHub address linked to the account, so they count on the profile.
