# Runbook

Everything here was done on the owner's machine: Windows 11, Node 22.23, npm 10.9, Git Bash and
PowerShell, Microsoft Edge and Chrome installed.

## First time

```sh
cd ~/Desktop/hours-to-go
npm install
```

Node must be 22.13 or newer: the server uses Node's built-in SQLite (`node:sqlite`). Every start
prints `ExperimentalWarning: SQLite is an experimental feature`; that is expected.

## Develop

Two terminals:

```sh
npm run dev:api     # API on http://127.0.0.1:8787, restarts on server changes
npm run dev:web     # app on http://localhost:5173, /api proxied to 8787
```

Without `dev:api` the app still opens, as a guest with a "can't reach the server" banner.

**On a phone on the same Wi-Fi:** run `npm run dev:web -- --host` and open the "Network" address it
prints. Session cookies aren't marked Secure in development, so signing in works over plain http.

**Local data:**
- Profiles: `data/hours-to-go.sqlite` (git-ignored). Delete it (with `-wal` and `-shm`) to start
  over, with the server stopped.
- Guest logbook: the browser's localStorage key `hours-to-go/v1`. Clear site data, or use
  Profile → "Erase this device's logbook".

## Check

```sh
npm run typecheck   # both tsconfigs; must be clean
npm test            # 70 tests: rules, logbook model, server API, app as guest, app signed in
```

The server tests run in Node (`// @vitest-environment node` at the top of the file) against an
in-memory database. The web tests run in jsdom with `fetch` stubbed.

## Build and run as in production

```sh
npm run build                                      # typecheck, then vite build to dist/
NODE_ENV=production PORT=8787 npm start            # Git Bash syntax
```

In PowerShell: `$env:NODE_ENV='production'; $env:PORT='8787'; npm start`.

| Variable | Default | |
| --- | --- | --- |
| `PORT` | 8787 | |
| `HOST` | 127.0.0.1, or 0.0.0.0 when production | |
| `DATABASE_PATH` | `data/hours-to-go.sqlite` | must be on a disk that survives redeploys |
| `NODE_ENV` | | `production` marks the cookie Secure, so the site must be served over HTTPS |

**Restart the server after every build.** `@fastify/static` registers one route per file in `dist/`
when it starts, so new hashed asset names 404 until it restarts.

## Checking the UI in a real browser

The jsdom tests can't see layout. Before calling a UI change done, open it at desktop size and at
phone size (390×844 with touch). Three real bugs were only found this way.

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
await p.getByRole('button', { name: 'Logbook', exact: true }).click();
await p.getByRole('button', { name: 'Log a flight' }).click();
const save = await p.getByRole('button', { name: 'Save', exact: true }).boundingBox();
console.log('Save button bottom:', save.y + save.height, 'of 844');   // must be on screen
await p.screenshot({ path: `${out}/phone-form.png` });
await browser.close();
```

Run it against a production build on a spare port with a throwaway database:

```sh
npm run build
DATABASE_PATH=/tmp/htg-check.sqlite PORT=8799 node --import tsx server/main.ts
```

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

**Vitest: "Failed to load url sqlite".** Vite drops the `node:` prefix from built-ins it doesn't know.
`server/db.ts` loads SQLite with `createRequire(import.meta.url)('node:sqlite')` for exactly this
reason. Don't change it to a plain import.

**Typecheck errors in `vite.config.ts`.** Vitest 2 ships its own Vite 5 types, which clash with Vite 6
under `exactOptionalPropertyTypes`. The file is deliberately in neither tsconfig.

**Long inline scripts in Git Bash.** Very long here-documents passed to `bash -c` sometimes fail with
"unexpected EOF while looking for matching `''". Write the script to a file and run the file.

**`npm install` warnings.** A deprecation warning for an old `glob` comes from a dependency's
dependency; it is harmless.

## Before committing

- `npm run typecheck` and `npm test` clean.
- Look at UI changes in a browser at phone size.
- `git status` shows no `data/`, `dist/` or exported `hours-to-go-*.json` files (all git-ignored; the
  exports contain personal flight records).
- Commits use this repo's identity, `Berk Yilmaz <91981362+nberkyilmaz@users.noreply.github.com>`,
  the GitHub address linked to the account, so they count on the profile.
