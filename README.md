# Matrix Automation & Control — website

Public site + admin panel for **matrixpakistan.com**.

Stack: Vite · React 19 · TypeScript · Tailwind CSS · shadcn/ui · React Router · TanStack Query · Supabase.

## Run it locally

Requires **Node.js 22** (or 20.19+). Check with `node -v`.

```bash
npm install
npm run dev        # http://localhost:8080
```

The app reads two values from `.env` (not committed to git):

```
VITE_SUPABASE_URL=https://aazzcamvqkobsvglizya.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Copy `.env.example` to `.env` if it's missing. **Only the publishable key goes here** — never the
`sb_secret_…` key. Everything prefixed `VITE_` is visible in the browser; the app refuses to start
if it detects a secret key.

## Scripts

| Command              | What it does                                                         |
| -------------------- | -------------------------------------------------------------------- |
| `npm run dev`        | Dev server with hot reload                                           |
| `npm run typecheck`  | TypeScript check only                                                |
| `npm run build`      | Type check + production build into `dist/`                           |
| `npm run prerender`  | After `build`: HTML snapshot of every public page + `sitemap.xml`    |
| `npm run smoke`      | After `prerender`: clicks through the built site in a real browser   |
| `npm run build:full` | `build` + `prerender` + `smoke`, exactly what the deploy workflow runs |
| `npm run preview`    | Serve the built `dist/` locally (SPA mode, ignores the snapshots)    |

`npm run prerender` needs Chromium once per machine: `npx playwright install chromium`.

## Project layout

```
public/               logo, favicons, og-image, robots.txt, .htaccess (copied as-is into dist/)
scripts/prerender.mjs HTML snapshots + sitemap (runs after vite build)
supabase/             Edge Function (inquiry email alerts) + SQL migrations to run by hand
.github/workflows/    deploy (build → prerender → FTPS) and Supabase keep-alive
src/
  main.tsx, App.tsx   entry + routes
  index.css           theme tokens (colors, glass-panel, glow-button, …)
  lib/supabase.ts     Supabase client (typed)
  lib/queries.ts      data hooks (React Query)
  hooks/use-seo.ts    per-page <title>, description, canonical, Open Graph, JSON-LD
  types/database.ts   database types — regenerate with the command at the top of the file
  components/ui/      shadcn/ui components
  components/layout/  header, footer, search, WhatsApp button
  pages/              one file per page
  admin/              admin panel (login, dashboard, inquiries, catalogue editors, settings)
```

## Admin panel

Open `/admin` (e.g. http://localhost:8080/admin). Sign in with the admin user created in
Supabase (Authentication → Users). A user can only get in if they have a row in the
`user_roles` table with role `admin`:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@matrixpakistan.com';
```

Admin code lives in `src/admin/` and is downloaded only when someone opens `/admin`.

## SEO: prerendered pages

The site is a single-page app, but search engines and link previews (WhatsApp, LinkedIn, …) get
real HTML:

1. `npm run build` builds the app into `dist/`.
2. `npm run prerender` (`scripts/prerender.mjs`) first copies the untouched `dist/index.html` to
   `dist/200.html` (the app shell). It then reads the list of published products and brands
   straight from Supabase, opens every public page in headless Chromium (animations off), waits
   until the data has loaded, and saves the finished HTML as `dist/<page>/index.html`
   (`dist/index.html` for Home). It also writes `dist/sitemap.xml`.
3. If anything is wrong (Supabase unreachable, a page shows its error state, a product or brand
   page renders "Page not found", a page never finishes loading), the script exits with an error
   and nothing is deployed.

**Visitors always get live data.** A snapshot is only the first paint. Each snapshot also contains the
public data it was drawn with (`<script id="rq-state">`: catalogue and site settings only, never
admin, auth or inquiry data). In the browser, `src/main.tsx`:

1. loads that data into React Query and immediately marks it **stale**,
2. downloads the page's code chunk, then starts the app (`createRoot`, no hydration). The first
   render matches the snapshot, so there is no flash of skeletons or spinners, and the page that
   opened from a snapshot skips its entrance animations,
3. every query then refetches from Supabase straight away, and live data replaces the snapshot data
   within moments.

So an admin edit shows up on the next page load, with no rebuild needed. A product created after
the last build has no snapshot yet, so Apache serves `200.html` and the app loads it live. It gets
its own snapshot and sitemap entry in the next nightly build.

## Smoke test

`npm run smoke` (`scripts/smoke.mjs`) serves `dist/` exactly the way `public/.htaccess` serves it on
cPanel: snapshot pages, the `200.html` fallback, and a 404 for missing `/assets/` files. It then
uses headless Chromium on desktop and mobile to:

- load every page directly, then click through the header nav, product and brand cards, a category
  filter, the mobile menu and header search, and Back/Forward,
- do all of that both with snapshots and without them (like a brand-new product),
- check the 404 page and the admin sign-in page, and that public pages never download admin code,
- simulate a code file deleted by a newer deploy: the page must show a message, not a white screen.

Any JavaScript error, failed request or blank page fails the run, so the deploy job never starts.
Many problems happen only on the live site, because there the app starts from a snapshot. `npm run
dev` and `npm run preview` don't do that, so run `npm run build:full` before pushing changes to
the app's startup, routing or animations.

## Error handling

- `src/components/layout/ErrorBoundary.tsx`: if a page crashes, it shows a message with a reload
  button. The header and footer keep working, and navigating away clears the error. A second,
  outer boundary covers everything else, so the app never ends up on a white screen.
- After a deploy, old code files are removed from the server. A visitor whose tab was already open
  gets one automatic reload to pick up the new version, at most once every 30 s, so it can never
  loop. Missing `/assets/` files return a real 404 (`.htaccess`).

## Performance notes

- Pages are prefetched: hovering, focusing or touching a link downloads that page's code and data,
  and all public page chunks are fetched once the browser is idle (`src/lib/link-prefetch.ts`).
  Admin code is never prefetched.
- Public pages use a REST-only Supabase client (`src/lib/db.ts`). The full client (auth, storage)
  is only in the admin chunk.
- framer-motion runs as `LazyMotion` + `m` (strict) with `MotionConfig reducedMotion="user"`.
  Nothing animates forever, and product grids render in batches of 48 with one fade for the whole grid.
- No `backdrop-filter` on cards (only a light blur on the fixed header). Fonts are self-hosted
  variable woff2 files (`src/assets/fonts`, preloaded). Vendor libraries are in separate,
  long-cached chunks (`vite.config.ts`).

Each page sets its own title, description, canonical URL, Open Graph/Twitter tags and JSON-LD
(`src/hooks/use-seo.ts`). The 404 page and the admin panel are `noindex`. `/admin` is never
prerendered and is blocked in `robots.txt`.

`public/.htaccess` serves the snapshots: `/products/abc` → `products/abc/index.html` if it exists,
otherwise `200.html`. It also removes trailing slashes (301) and turns `DirectorySlash` off.

## Deploying (GitHub Actions → cPanel)

`.github/workflows/deploy.yml` runs on every push to `main`, every night at 02:00 Pakistan time
(so new products get snapshots and sitemap entries), and on demand (Actions → Build & deploy →
Run workflow). Two runs never overlap.

- **build** job: `npm ci` → `npm run build` → install Chromium → `npm run prerender` →
  `npm run smoke` → uploads
  `dist/` as an artifact (you can download it from the run page).
- **deploy** job: runs **only if the variable `DEPLOY_ENABLED` is `true`**. It uploads `dist/` over
  FTPS with [FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action). Only changed
  files are uploaded. Files are deleted on the server only if this action uploaded them earlier
  (tracked in `.ftp-deploy-sync-state.json`), so `cgi-bin`, `.well-known` and other server files
  are never touched.

Until `DEPLOY_ENABLED` is set, pushes only build and check. The live site is not touched.

Repository → **Settings → Secrets and variables → Actions**:

| Kind     | Name                            | Value                                                                  |
| -------- | ------------------------------- | ---------------------------------------------------------------------- |
| Variable | `VITE_SUPABASE_URL`             | `https://aazzcamvqkobsvglizya.supabase.co`                             |
| Variable | `VITE_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key (public, safe as a variable)                |
| Variable | `DEPLOY_ENABLED`                | `true` to deploy. Leave unset/anything else to only build              |
| Variable | `FTP_SERVER_DIR`                | optional, default `./`. Folder for the site, relative to the FTP login, ending in `/` (e.g. `public_html/`) |
| Secret   | `FTP_SERVER`                    | e.g. `ftp.matrixpakistan.com`                                          |
| Secret   | `FTP_USERNAME`                  | cPanel FTP account                                                     |
| Secret   | `FTP_PASSWORD`                  | its password                                                           |

**First deploy:** the first run uploads everything. Files from the old site that have the same
name (e.g. `index.html`, `.htaccess`) are overwritten, but other old files stay. Delete them by
hand in cPanel File Manager if you want them gone (keep `cgi-bin`, `.well-known`, and
`.ftp-deploy-sync-state.json`).

GitHub pauses scheduled workflows in repositories with no commits for 60 days. If that happens,
re-enable them under Actions.

Manual deploy (without GitHub): `npm run build:full`, then upload the **contents** of `dist/`
(including the hidden `.htaccess`) into `public_html/`.

### Supabase keep-alive

Free Supabase projects pause after 7 days without activity. `.github/workflows/keep-alive.yml`
reads one row every 3 days. If the project is paused anyway, that run fails and GitHub emails you.
It uses the same two `VITE_SUPABASE_*` variables.

## Email alerts for new inquiries

A Supabase Edge Function emails sales@ whenever someone sends the contact or quote form. Reply goes
straight to the customer. Setup (secrets, deploy command, Database Webhook):
[supabase/functions/inquiry-alert/README.md](supabase/functions/inquiry-alert/README.md).

## Spam guard for the forms

[supabase/migrations/002_inquiry_spam_guard.sql](supabase/migrations/002_inquiry_spam_guard.sql)
adds a database trigger that rejects new inquiries when:

- there have been 20 or more in the last 10 minutes (flood guard), or
- the same email or phone sent the same message in the last 5 minutes (double submit).

Run it once in **Supabase → SQL Editor** (safe to run again). The forms then show "Too many
messages right now…" or "We already have this message" instead of a generic error.
