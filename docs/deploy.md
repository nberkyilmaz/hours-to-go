# Putting it live

The page goes at **<https://nberkyilmaz.com/hours-to-go/>**, beside the owner's other projects on
the same domain. Three pieces, each where it fits best, all on free plans:

| Piece | Where | Address | Monthly | Yearly |
| --- | --- | --- | --- | --- |
| The page | GitHub Pages | `https://nberkyilmaz.com/hours-to-go/` | free | — |
| The API | Render, Docker web service | `https://hours-to-go-api.nberkyilmaz.com` | free (sleeps), or $7 to stay awake | — |
| Accounts and logbooks | Neon Postgres | — | free | — |
| Password-reset emails | Resend | from `no-reply@nberkyilmaz.com` | free (3,000 a month, 100 a day) | — |
| The domain | Cloudflare | `nberkyilmaz.com` | — | already paid for the portfolio; nothing extra for this project |

## Why it is split this way

- **GitHub Pages serves files only**, so the page can live at a path on the domain but the API
  can't. The API runs on Render and the page calls it.
- **The API must be on a `nberkyilmaz.com` subdomain**, not its `onrender.com` address. The session
  cookie comes from the API. A cookie from `hours-to-go-api.nberkyilmaz.com` belongs to the same
  site as the page and is kept; one from `onrender.com` is a third-party cookie and browsers drop
  it, so signing in would appear to work and then forget you.
- **Neon, not a file on Render's disk.** A Render service's own disk is wiped on every deploy, and
  on the free plan every time it sleeps. SQLite there would lose every profile. The server refuses
  to start in production unless `DATABASE_URL` names a database.

---

## Steps, in this order

Step 4 is the domain itself, shared with departure-brief, and is done once for both; the rest are
this project's. Nothing here can be done for you: each needs your accounts.

### 1. Neon: the database

1. Sign in at <https://neon.tech> (the free plan does not expire, unlike Render's own Postgres,
   which is deleted after 30 days).
2. Create a project named `hours-to-go`, region **AWS US East 2 (Ohio)**, next to the API. If the
   plan won't take another project, a database named `hours_to_go` in an existing project is
   just as good.
3. Copy the connection string (the project's dashboard → **Connect**). It looks like
   `postgresql://user:password@ep-something.us-east-2.aws.neon.tech/neondb?sslmode=require`.
   Keep the `?sslmode=require`.

The tables create themselves the first time the server starts, and later changes to them run
once each when a new version starts (D33). At start, Render's logs show a
"SECURITY WARNING" about SSL modes from the Postgres driver: it means the database's certificate
is checked in full, which Neon passes. Nothing to do.

### 2. Render: the API

1. <https://dashboard.render.com> → **New → Blueprint** → this repository. It reads
   [`render.yaml`](../render.yaml): a free Docker web service named `hours-to-go-api` in Ohio, with
   a health check on `/api/health`.
2. It asks for `DATABASE_URL`: paste the Neon string. `ALLOWED_ORIGINS` is already set to
   `https://nberkyilmaz.com`.
3. Deploy, then open `https://<the service>.onrender.com/api/health`. It answers `{"ok":true}`
   once the database answers too, and 503 if it doesn't.
4. **Settings → Build & Deploy → Auto-Deploy** should say "After CI checks pass", from
   `autoDeployTrigger` in `render.yaml`: a push to main goes live only once its tests pass.

### 3. The API's subdomain

1. Render → the service → **Settings → Custom Domains** → add
   `hours-to-go-api.nberkyilmaz.com`. Render shows the exact target.
2. Cloudflare → `nberkyilmaz.com` → **DNS** → add:

   ```
   CNAME   hours-to-go-api   <the service>.onrender.com
   ```

   **DNS only (grey cloud).** Proxied, Render can't verify the name or issue its certificate.
3. Back in Render, **Verify**. Render issues and renews the certificate.
4. `https://hours-to-go-api.nberkyilmaz.com/api/health` answers `{"ok":true}`.

### 4. The domain on GitHub Pages (once, for every project)

GitHub serves a project's Pages site at a path on the domain when the domain belongs to the
account's **user site**, the repository named `nberkyilmaz.github.io`:

| Repository | Served at |
| --- | --- |
| `nberkyilmaz.github.io` | `https://nberkyilmaz.com/` |
| `departure-brief` | `https://nberkyilmaz.com/departure-brief/` |
| `hours-to-go` | `https://nberkyilmaz.com/hours-to-go/` |

Done on 2026-10-28. The user site is <https://github.com/nberkyilmaz/nberkyilmaz.github.io> (the
landing page linking both projects), with custom domain `nberkyilmaz.com`, the four A and four
AAAA records and the `www` CNAME at Cloudflare, all **DNS only**, and Enforce HTTPS ticked.
Details are under **"The domain"** in departure-brief's `docs/deploy.md`. Still to do: verify the
domain on the account. Don't create a second user site.

**Enforce HTTPS is per project site.** Ticking it on the user site doesn't cover
`/hours-to-go/`: tick it in this repository's Settings → Pages too. If the tick doesn't stick,
`gh api -X PUT repos/nberkyilmaz/hours-to-go/pages -F https_enforced=true` sets it.

In this repository, **nothing changes** for the domain: no `CNAME` file, and the path stays
`/hours-to-go/` (the Pages workflow takes it from the repository name; renaming the repository
moves the page).

### 5. This repository's Pages

1. GitHub → `hours-to-go` → **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   `API_URL` = `https://hours-to-go-api.nberkyilmaz.com` (no trailing slash). The workflow refuses
   to publish without it, because a page with no API would tell every pilot the server is down.
3. **Actions → Pages → Run workflow**. Later pushes to `main` that touch the page publish it
   by themselves.

### 6. Resend: the emails

nberkyilmaz.com already has Resend's DNS records at Cloudflare (`resend._domainkey`, `send`).

1. Sign in at <https://resend.com> → **Domains**: `nberkyilmaz.com` must say **Verified**. If it
   isn't there, add it, and let Resend add its records at Cloudflare.
2. **API Keys → Create API Key**: name `hours-to-go`, permission **Sending access**, domain
   `nberkyilmaz.com`. Copy it; Resend shows it once.
3. Render → `hours-to-go-api` → **Environment**: add `RESEND_API_KEY` with that key and save.
   `MAIL_FROM` and `APP_URL` come from `render.yaml`. The service redeploys.
4. On the page: Profile → Sign in → **Forgot your password?** with your own email. The email
   arrives from `no-reply@nberkyilmaz.com` within a minute; check spam the first time.

Until the key is set, asking for a link says resetting "isn't available yet", and Render's log
says "Password reset emails are off".

5. **Feedback**: Render → `hours-to-go-api` → **Environment**: add `FEEDBACK_TO` with the address
   where you want pilots' messages, and save. It isn't in `render.yaml`, so your address isn't
   published. Then Profile → **Send feedback** on the page: the message arrives from
   `no-reply@nberkyilmaz.com`, and **Reply** answers the pilot. Until it is set, sending says
   feedback "isn't available yet", and Render's log says "Feedback and error alerts are off".
   The same address gets an email when something fails on the server (D37), at most 5 an hour.

### 7. Check it as a pilot would

On a phone, open <https://nberkyilmaz.com/hours-to-go/>, create a profile, log a flight, add it
to the home screen. On a computer, sign in: the same flight is there.

If the page says **"Can't reach the server"**, it's usually one of these:

- The page isn't on `nberkyilmaz.com` yet (step 4). At `nberkyilmaz.github.io/hours-to-go/` the
  API refuses it, by design.
- `API_URL` has a typo or a trailing slash. Fix it and run the Pages workflow again.
- The API is down: check `/api/health` and the Render logs.

### 8. Backups: a private repository

Every night a workflow copies the database, restores the copy into an empty Postgres to prove it
works, and keeps it for 90 days (D29). It lives in the private repository
`nberkyilmaz/hours-to-go-backups`, never this public one, because the copies hold every pilot's
records.

1. Neon → the project → **Connect**. Turn **Connection pooling** off, show the password, and copy
   the string. Its host has no `-pooler`; `pg_dump` needs the direct connection.
2. In `hours-to-go-backups`: **Settings → Secrets and variables → Actions → New repository
   secret**, name `DATABASE_URL`, paste it.
3. **Actions → Backup → Run workflow**, or re-run the check on its open pull request. It should go
   green in a couple of minutes, and its summary says how many profiles and logbook lines came back.

A failed night emails you. To restore, follow that repository's README: download a copy, restore it
into a new Neon branch, check it, then point Render's `DATABASE_URL` at it. If the Neon password is
ever reset, update this secret too.

---

## What "free" costs you

- **The API sleeps** after 15 minutes without a request, and the next one waits about a minute
  while it wakes. Three things soften that:
  - A browser that has never signed in opens at once, as a guest, without asking the API.
    Visitors from the portfolio never wait, and don't use up the free hours.
  - Opening Profile starts the API waking, so it is usually up by the time the pilot has typed
    an email and password.
  - A signed-in pilot opening the app waits for their own logbook. After 4 seconds the loading
    screen says why, so it doesn't look broken.

  **$7/month** (Render Starter) keeps it awake: change the plan, no code changes.
- **Render's 750 free hours a month** are per workspace, shared with any other free service in
  it (departure-brief's API, when it's deployed). A sleeping service uses none.
- **Neon's free plan** has a storage cap (0.5 GB when this was written); a flight is about a
  kilobyte. The database pauses when idle and wakes in under a second. The free plan's restore
  window is short, so a private repository keeps nightly copies for 90 days (step 8), on GitHub's
  free minutes.
- **Safari** keeps a cookie from an API on a different server than the page for only 7 days. The
  app renews it every time it opens, so only a pilot who goes more than a week without opening it
  on an iPhone has to sign in again. Other browsers keep it the full 90 days, renewed the same way.

## Running the API's image yourself

```sh
docker build -t hours-to-go-api .
docker run --rm -p 8787:8787 -e DATABASE_URL=memory:// hours-to-go-api
curl http://127.0.0.1:8787/api/health
```

`memory://` is a throwaway database inside the container. CI builds and starts the image the same
way on every push, so a Dockerfile that would fail on Render fails there first.

## One process instead

Everything still runs as one process serving the page and the API from one origin, as before (no
CORS, no `VITE_API`): `npm run build`, then `NODE_ENV=production DATABASE_URL=… npm start`. That suits a
machine you control. `DATABASE_URL` is then a Postgres URL or a folder on a disk that lasts.
