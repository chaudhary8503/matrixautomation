#!/usr/bin/env node
// Prerender: saves an HTML snapshot of every public page into dist/, plus dist/sitemap.xml.
//
//   npm run build && npm run prerender
//
// Snapshots exist for crawlers, link previews and first paint ONLY. In the browser the app still
// starts from scratch (createRoot, not hydrate) and loads live data from Supabase, so admin edits
// show up on the next page load without a rebuild. Pages without a snapshot (e.g. a product added
// after the last build) are served the untouched app shell, dist/200.html (see public/.htaccess).
//
// Any problem (Supabase unreachable, an error state, a product/brand rendering the 404 page, a
// page that never finishes loading) fails the whole run, so a broken snapshot is never deployed.

import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const SITE_URL = "https://matrixpakistan.com";
const STATIC_ROUTES = ["/", "/who-we-are", "/products", "/brands", "/industries", "/contact"];
const CONCURRENCY = 4;
const TIMEOUT = 45_000;
const SLUG_RE = /^[a-z0-9][a-z0-9._~-]*$/i;
// Second line of defence (the app already filters, src/lib/query-client.ts): only these cache
// entries may ever be embedded in a snapshot. Never admin, auth, search or inquiry data.
const PUBLIC_QUERY_KEYS = new Set([
  "site_settings",
  "catalog",
  "categories",
  "brands",
  "brand",
  "brand_categories",
  "brand_products",
  "category_documents",
  "product",
  "industries",
]);

const started = Date.now();
const log = (...a) => console.log("[prerender]", ...a);

class PrerenderError extends Error {}
const fail = (msg) => {
  throw new PrerenderError(msg);
};

/* ------------------------------------------------------------------ env -- */

// Values already in the environment (CI) win over .env.
if (existsSync(path.join(ROOT, ".env"))) {
  const parsed = parseEnv(await readFile(path.join(ROOT, ".env"), "utf8"));
  for (const [k, v] of Object.entries(parsed)) if (!process.env[k]) process.env[k] = v;
}
const SUPABASE_URL = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/* ------------------------------------------------------------- supabase -- */

/** GET a REST resource, following pages of 1000 rows. */
async function rest(resource) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const sep = resource.includes("?") ? "&" : "?";
    const url = `${SUPABASE_URL}/rest/v1/${resource}${sep}limit=1000&offset=${offset}`;
    let res;
    try {
      res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Accept: "application/json" } });
    } catch (err) {
      fail(`Supabase is unreachable (${err.cause?.code ?? err.message}) — ${url}`);
    }
    if (!res.ok) fail(`Supabase answered ${res.status} for ${url}: ${(await res.text()).slice(0, 300)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const latest = (dates) => dates.filter(Boolean).sort().at(-1) ?? null;

async function loadRoutes() {
  const [products, brands] = await Promise.all([
    rest("products?select=slug,brand_id,updated_at&is_published=eq.true&order=slug"),
    rest("brands?select=id,slug,updated_at&order=slug"),
  ]);

  const valid = (kind) => (row) => {
    if (SLUG_RE.test(row.slug ?? "")) return true;
    console.warn(`[prerender] skipping ${kind} with an unusual slug: ${JSON.stringify(row.slug)}`);
    return false;
  };

  const productLastmod = new Map(); // brand_id -> newest product change
  for (const p of products) {
    productLastmod.set(p.brand_id, latest([productLastmod.get(p.brand_id), p.updated_at]));
  }

  return [
    ...STATIC_ROUTES.map((route) => ({
      route,
      lastmod:
        route === "/products"
          ? latest(products.map((p) => p.updated_at))
          : route === "/brands"
            ? latest(brands.map((b) => b.updated_at))
            : null,
    })),
    ...products.filter(valid("product")).map((p) => ({ route: `/products/${p.slug}`, lastmod: p.updated_at })),
    ...brands
      .filter(valid("brand"))
      .map((b) => ({ route: `/brands/${b.slug}`, lastmod: latest([b.updated_at, productLastmod.get(b.id)]) })),
  ];
}

/* --------------------------------------------------------------- server -- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

/** Serves dist/ like the live site, except that every page gets the app shell (200.html) —
 *  never a snapshot written earlier in this run. */
function startServer() {
  const shell = path.join(DIST, "200.html");
  const server = createServer(async (req, res) => {
    let file = shell;
    try {
      const rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const candidate = path.join(DIST, rel);
      if (candidate.startsWith(DIST + path.sep) && path.basename(candidate) !== "index.html") {
        if ((await stat(candidate)).isFile()) file = candidate;
      }
    } catch {
      /* not a file → app shell */
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/* ------------------------------------------------------------- snapshot -- */

const BUSY = '[aria-busy="true"], .animate-pulse';

/** Elements still at inline opacity 0, i.e. an entrance animation that never ran. */
const findHidden = () =>
  [...document.querySelectorAll("#root [style]")].filter((el) =>
    /(^|;)\s*opacity:\s*0(\.0+)?\s*(;|$)/.test(el.getAttribute("style")),
  );
const describe = (el) => `<${el.tagName.toLowerCase()} class="${el.className}">`;

async function waitUntilSettled(page) {
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT });
  await page.waitForFunction(
    (busy) => !!document.querySelector("#root main") && !document.querySelector(busy),
    BUSY,
    { timeout: TIMEOUT },
  );
}

async function snapshot(context, origin, route) {
  const page = await context.newPage();
  const problems = [];
  const isSupabase = (url) => url.startsWith(SUPABASE_URL);
  page.on("pageerror", (err) => problems.push(`JavaScript error: ${err.message}`));
  page.on("requestfailed", (r) => {
    if (isSupabase(r.url())) problems.push(`Supabase request failed (${r.failure()?.errorText}): ${r.url()}`);
  });
  page.on("response", (r) => {
    if (isSupabase(r.url()) && r.status() >= 400) problems.push(`Supabase answered ${r.status()}: ${r.url()}`);
  });

  try {
    await page.goto(origin + route, { waitUntil: "networkidle", timeout: TIMEOUT });
    await waitUntilSettled(page);

    // Scroll down in steps so every whileInView section (and lazy data under it) renders.
    await page.evaluate(async () => {
      const pause = () => new Promise((r) => setTimeout(r, 150));
      for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(window.innerHeight * 0.5)) {
        window.scrollTo(0, y);
        await pause();
      }
      window.scrollTo(0, document.documentElement.scrollHeight);
      await pause();
    });
    await waitUntilSettled(page);
    // Give in-view animations (instant while prerendering) a moment to apply.
    // A fast scroll can skip past a section before its in-view trigger fires: bring each
    // straggler into view directly, then give it a moment.
    for (let attempt = 0; attempt < 3; attempt++) {
      const settled = await page
        .waitForFunction(() => window.__prerenderHidden().length === 0, null, { timeout: 2000 })
        .then(() => true, () => false);
      if (settled) break;
      await page.evaluate(async () => {
        for (const el of window.__prerenderHidden()) {
          el.scrollIntoView({ block: "center" });
          await new Promise((r) => setTimeout(r, 200));
        }
      });
    }
    await page.waitForTimeout(300);

    if (problems.length) fail(problems.join("\n  "));

    const result = await page.evaluate(
      (busy) => {
        const report = {
          error: !!document.querySelector("[data-error-state]"),
          notFound: !!document.querySelector("[data-not-found]"),
          busy: !!document.querySelector(busy),
          canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
          robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
          hidden: window.__prerenderHidden().map(window.__prerenderDescribe),
          html: "",
        };

        // Transient bits that must not be frozen into the snapshot.
        document.querySelectorAll("[data-sonner-toast]").forEach((el) => el.remove());
        document.querySelectorAll('a[aria-label="Chat with us on WhatsApp"]').forEach((el) => el.removeAttribute("style"));
        // Vite's preload helper writes absolute URLs (http://127.0.0.1:port/assets/…) — make them root-relative.
        for (const el of document.querySelectorAll("[href], [src]")) {
          for (const attr of ["href", "src"]) {
            const v = el.getAttribute(attr);
            if (v?.startsWith(location.origin)) el.setAttribute(attr, v.slice(location.origin.length) || "/");
          }
        }
        // Constant (no timestamp), so unchanged pages stay byte-identical and are not re-uploaded.
        document.documentElement.setAttribute("data-prerendered", "true");

        // The data this page was drawn with (public queries only — the app filters them), so the
        // browser's first render matches the snapshot. The app marks it stale and refetches at once.
        const state = window.__RQ_DEHYDRATE__?.() ?? { mutations: [], queries: [] };
        report.queryKeys = state.queries.map((q) => q.queryKey);
        report.dropped = [];
        state.queries = state.queries.filter((q) => {
          // A very large query (e.g. thousands of products) isn't worth inlining into every page.
          const big = JSON.stringify(q).length > 400_000;
          if (big) report.dropped.push(JSON.stringify(q.queryKey));
          return !big;
        });
        const script = document.createElement("script");
        script.type = "application/json";
        script.id = "rq-state";
        // "<" escaped, so nothing in the data (e.g. "</script>") can end the tag early.
        script.textContent = JSON.stringify(state).replace(/</g, "\\u003c");
        document.body.appendChild(script);

        report.html = `<!doctype html>\n${document.documentElement.outerHTML}`;
        if (report.html.includes("127.0.0.1")) report.localUrl = true;
        return report;
      },
      BUSY,
    );

    const expectedCanonical = SITE_URL + route;
    if (result.error) fail(`${route} shows the error state`);
    if (result.notFound) fail(`${route} renders the 404 page`);
    if (result.busy) fail(`${route} is still loading`);
    if (result.robots) fail(`${route} has <meta name="robots" content="${result.robots}">`);
    if (result.canonical !== expectedCanonical) fail(`${route}: canonical is ${result.canonical}, expected ${expectedCanonical}`);
    if (result.localUrl) fail(`${route}: snapshot contains a local server URL`);
    const privateKey = result.queryKeys.find((k) => !PUBLIC_QUERY_KEYS.has(k[0]));
    if (privateKey) fail(`${route}: non-public query ${JSON.stringify(privateKey)} would be embedded`);
    if (!result.queryKeys.length) fail(`${route}: no query data captured (window.__RQ_DEHYDRATE__ missing?)`);
    for (const k of result.dropped) console.warn(`[prerender] ${route}: query ${k} too large to embed, skipped`);
    if (result.hidden.length) fail(`${route}: ${result.hidden.length} element(s) left at opacity 0, e.g. ${result.hidden[0]}`);

    const out = route === "/" ? path.join(DIST, "index.html") : path.join(DIST, ...route.split("/").filter(Boolean), "index.html");
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, result.html);
  } finally {
    await page.close();
  }
}

/* -------------------------------------------------------------- sitemap -- */

const xmlEscape = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

function sitemap(entries) {
  const urls = entries.map(({ route, lastmod }) => {
    const loc = `    <loc>${xmlEscape(SITE_URL + (route === "/" ? "/" : route))}</loc>`;
    const mod = lastmod ? `\n    <lastmod>${new Date(lastmod).toISOString()}</lastmod>` : "";
    return `  <url>\n${loc}${mod}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/* ----------------------------------------------------------------- main -- */

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) fail("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set (env or .env).");
  if (SUPABASE_KEY.startsWith("sb_secret_")) fail("VITE_SUPABASE_PUBLISHABLE_KEY is a SECRET key. Use the publishable key.");

  // 1. Keep the untouched app shell as 200.html — the fallback for pages without a snapshot.
  const indexFile = path.join(DIST, "index.html");
  const shellFile = path.join(DIST, "200.html");
  if (!existsSync(indexFile)) fail("dist/index.html not found — run `npm run build` first.");
  const indexHtml = await readFile(indexFile, "utf8");
  if (indexHtml.includes("data-prerendered=")) {
    // Already prerendered (script run twice without a rebuild): 200.html is the real shell.
    if (!existsSync(shellFile)) fail("dist/index.html is a snapshot and dist/200.html is missing — run `npm run build` again.");
  } else {
    await copyFile(indexFile, shellFile);
  }

  // 2. Routes, straight from Supabase.
  const entries = await loadRoutes();
  log(`${entries.length} routes (${STATIC_ROUTES.length} static + products + brands)`);

  // 3. Local server with the same SPA fallback as the live site.
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;

  // 4. Snapshots.
  const browser = await chromium.launch();
  let done = 0;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    await context.addInitScript(`window.__PRERENDER__ = true; window.__prerenderHidden = ${findHidden}; window.__prerenderDescribe = ${describe};`);

    const queue = [...entries];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        await snapshot(context, origin, next.route);
        done++;
        if (done % 10 === 0 || done === entries.length) log(`${done}/${entries.length} pages`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  } finally {
    await browser.close();
    server.close();
  }

  // 5. Sitemap.
  await writeFile(path.join(DIST, "sitemap.xml"), sitemap(entries));

  // 6. Summary.
  log(`done: ${done} pages + sitemap.xml (${entries.length} URLs) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(`\n[prerender] FAILED: ${err instanceof PrerenderError ? err.message : err.stack ?? err}`);
  console.error("[prerender] Nothing should be deployed from this dist/ folder.");
  process.exit(1);
});
