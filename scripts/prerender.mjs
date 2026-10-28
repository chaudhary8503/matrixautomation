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
// Pages rendered at the same time. Mostly waiting on the network, so well above the CPU count is fine.
const CONCURRENCY = Number(process.env.PRERENDER_CONCURRENCY) || 20;
// Only for timing tests: render just the first N routes (the run still fails/passes normally).
const LIMIT = Number(process.env.PRERENDER_LIMIT) || 0;
// 1×1 transparent PNG: stands in for product/category photos while prerendering (see below).
const BLANK_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const TIMEOUT = 45_000;
const SLUG_RE = /^[a-z0-9][a-z0-9._~-]*$/i;
// Second line of defence (the app already filters, src/lib/query-client.ts): only these cache
// entries may ever be embedded in a snapshot. Never admin, auth, search or inquiry data.
const PUBLIC_QUERY_KEYS = new Set([
  "site_settings",
  "categories",
  "brands",
  "brand",
  "brand_categories",
  "category_documents",
  "product",
  "product_page", // one page (48) of the product list
  "related_products",
  "category_counts",
  "search_category_counts",
  "brand_counts",
  "industries",
  "logo_box",
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

/** Non-fatal issues (e.g. a product photo that failed to download), listed at the end. */
const warnings = new Set();

/** Logo measurements collected from every page: logo URL → box (written to dist/logo-boxes.json). */
const logoBoxes = new Map();

/**
 * A browser tab that renders many pages: it loads the site once, then moves from page to page
 * inside the app (like a visitor clicking links). Starting the app is the expensive part of a
 * page load, so this is several times faster than loading every page from scratch.
 */
async function openTab(context) {
  const page = await context.newPage();
  const tab = { page, problems: [], inflight: 0, lastActivity: Date.now(), loaded: false, used: 0 };
  // Data requests (the REST API) must succeed — the snapshot is built from them. A product photo
  // that fails to download doesn't change the HTML, so it is only a warning.
  const isApi = (url) => url.startsWith(`${SUPABASE_URL}/rest/`);
  const isSupabase = (url) => url.startsWith(SUPABASE_URL);
  page.on("pageerror", (err) => tab.problems.push(`JavaScript error: ${err.message}`));
  page.on("request", () => {
    tab.inflight++;
    tab.lastActivity = Date.now();
  });
  const settle = () => {
    tab.inflight = Math.max(0, tab.inflight - 1);
    tab.lastActivity = Date.now();
  };
  page.on("requestfinished", settle);
  page.on("requestfailed", (r) => {
    settle();
    const msg = `Supabase request failed (${r.failure()?.errorText}): ${r.url()}`;
    if (isApi(r.url())) tab.problems.push(msg);
    else if (isSupabase(r.url())) warnings.add(msg);
  });
  page.on("response", (r) => {
    if (r.status() < 400) return;
    const msg = `Supabase answered ${r.status()}: ${r.url()}`;
    if (isApi(r.url())) tab.problems.push(msg);
    else if (isSupabase(r.url())) warnings.add(msg);
  });
  return tab;
}

/** Waits until no request has been running for `quietMs` (like Playwright's "networkidle", but
 *  usable after an in-app page change too). */
async function waitForQuiet(tab, quietMs = 400) {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT) {
    if (tab.inflight === 0 && Date.now() - tab.lastActivity >= quietMs) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  fail(`network never went quiet (${tab.inflight} request(s) still running)`);
}

async function snapshot(tab, origin, route, { fresh }) {
  const { page } = tab;
  tab.problems.length = 0;
  const expectedCanonical = SITE_URL + route;

  if (fresh || !tab.loaded) {
    await page.goto(origin + route, { waitUntil: "networkidle", timeout: TIMEOUT });
    tab.loaded = true;
    await waitUntilSettled(page);
  } else {
    // In-app page change, exactly what the router does when a link is clicked.
    await page.evaluate((r) => {
      history.pushState(null, "", r);
      dispatchEvent(new PopStateEvent("popstate"));
    }, route);
    // The new page is on screen once its own canonical address is set and nothing is loading.
    // (If not — e.g. it renders "not found" — the retry loads it fresh and reports exactly why.)
    await page.waitForFunction(
      ([busy, canonical]) =>
        document.querySelector('link[rel="canonical"]')?.getAttribute("href") === canonical &&
        !!document.querySelector("#root main") &&
        !document.querySelector(busy),
      [BUSY, expectedCanonical],
      { timeout: TIMEOUT },
    );
  }
  await waitForQuiet(tab);

  // Scroll down in steps so every whileInView section (and lazy data under it) renders.
  await page.evaluate(async () => {
    const pause = () => new Promise((r) => setTimeout(r, 120));
    for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(window.innerHeight * 0.9)) {
      window.scrollTo(0, y);
      await pause();
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await pause();
  });
  await waitForQuiet(tab);
  await waitUntilSettled(page);
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
  await page.waitForTimeout(150);

  // Every logo must be measured (src/lib/logo-trim.ts) before the snapshot, or it would be
  // frozen invisible. Lazy logos have loaded by now, because the page was scrolled to the end.
  const logosDone = await page
    .waitForFunction(() => !document.querySelector("[data-logo-pending]"), null, { timeout: 15_000 })
    .then(() => true, () => false);
  if (!logosDone) {
    const left = await page.$$eval("[data-logo-pending]", (els) => els.map((e) => e.getAttribute("src")));
    fail(`${route}: ${left.length} logo(s) never finished loading/measuring, e.g. ${left[0]}`);
  }

  if (tab.problems.length) fail(tab.problems.join("\n  "));

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

      // Everything below works on a COPY of the page, so the live app (which goes on to render
      // the next page) is never touched.
      const root = document.documentElement.cloneNode(true);
      // Transient bits that must not be frozen into the snapshot.
      root.querySelectorAll("[data-sonner-toast]").forEach((el) => el.remove());
      root.querySelectorAll('a[aria-label="Chat with us on WhatsApp"]').forEach((el) => el.removeAttribute("style"));
      // Logos were loaded in CORS mode only so they could be measured here; visitors load them normally.
      root.querySelectorAll("img[data-logo]").forEach((el) => el.removeAttribute("crossorigin"));
      // Vite's preload helper writes absolute URLs (http://127.0.0.1:port/assets/…) — make them root-relative.
      for (const el of root.querySelectorAll("[href], [src]")) {
        for (const attr of ["href", "src"]) {
          const v = el.getAttribute(attr);
          if (v?.startsWith(location.origin)) el.setAttribute(attr, v.slice(location.origin.length) || "/");
        }
      }
      // Constant (no timestamp), so unchanged pages stay byte-identical and are not re-uploaded.
      root.setAttribute("data-prerendered", "true");

      // The data this page was drawn with (public queries this page uses — the app filters them),
      // so the browser's first render matches the snapshot. The app marks it stale and refetches.
      const state = window.__RQ_DEHYDRATE__?.() ?? { mutations: [], queries: [] };
      report.queryKeys = state.queries.map((q) => q.queryKey);
      report.logoBoxes = state.queries.filter((q) => q.queryKey[0] === "logo_box").map((q) => [q.queryKey[1], q.state.data]);
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
      root.querySelector("body").appendChild(script);

      report.html = `<!doctype html>\n${root.outerHTML}`;
      if (report.html.includes("127.0.0.1")) report.localUrl = true;
      return report;
    },
    BUSY,
  );

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
  for (const [src, box] of result.logoBoxes) logoBoxes.set(src, box);
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
  const allEntries = await loadRoutes();
  const entries = LIMIT ? allEntries.slice(0, LIMIT) : allEntries;
  log(`${entries.length} routes (${STATIC_ROUTES.length} static + products + brands), ${CONCURRENCY} at a time`);
  if (LIMIT) console.warn(`[prerender] PRERENDER_LIMIT=${LIMIT}: timing test only — this dist/ is incomplete, don't deploy it`);

  // 3. Local server with the same SPA fallback as the live site.
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;

  // 4. Snapshots.
  const browser = await chromium.launch();
  let done = 0;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
    // Photos don't change the saved HTML (the <img> tag keeps its real address), so they are answered
    // instantly with a blank image instead of being downloaded — a large share of the time per page.
    // Brand/client logos are still loaded for real: they are measured for logo trimming.
    await context.route(/\/storage\/v1\/object\/public\/images\/(products|categories)\//, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: BLANK_PNG }),
    );
    await context.addInitScript(`window.__PRERENDER__ = true; window.__prerenderHidden = ${findHidden}; window.__prerenderDescribe = ${describe};`);

    const queue = [...entries];
    const worker = async () => {
      let tab = await openTab(context);
      const replaceTab = async () => {
        await tab.page.close().catch(() => {});
        tab = await openTab(context);
      };
      try {
        for (let next = queue.shift(); next; next = queue.shift()) {
          // Thousands of pages means tens of thousands of requests: one network hiccup shouldn't
          // throw the whole run away. A failing page is tried up to 3 times, the retries in a fresh
          // tab with a full page load; a real problem (error state, 404, missing data) fails every
          // time and still stops the run.
          for (let attempt = 1; ; attempt++) {
            try {
              await snapshot(tab, origin, next.route, { fresh: attempt > 1 });
              break;
            } catch (err) {
              if (attempt >= 3) throw err;
              log(`retrying ${next.route} (attempt ${attempt + 1} of 3): ${String(err.message ?? err).split("\n")[0]}`);
              await replaceTab();
              await new Promise((r) => setTimeout(r, 2000 * attempt));
            }
          }
          done++;
          if (done % 50 === 0 || done === entries.length) log(`${done}/${entries.length} pages`);
          // A fresh tab now and then keeps memory use flat over thousands of pages.
          if (++tab.used >= 300) await replaceTab();
        }
      } finally {
        await tab.page.close().catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  } finally {
    await browser.close();
    server.close();
  }

  // 5. Sitemap, and the logo measurements for the whole site (src/lib/logo-trim.ts).
  await writeFile(path.join(DIST, "sitemap.xml"), sitemap(entries));
  const boxes = Object.fromEntries([...logoBoxes].sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(path.join(DIST, "logo-boxes.json"), JSON.stringify(boxes));

  // 6. Summary.
  for (const w of [...warnings].slice(0, 10)) console.warn(`[prerender] warning (not blocking): ${w}`);
  if (warnings.size > 10) console.warn(`[prerender] … and ${warnings.size - 10} more warnings`);
  log(`done: ${done} pages + sitemap.xml (${entries.length} URLs) + ${logoBoxes.size} logo measurements in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(`\n[prerender] FAILED: ${err instanceof PrerenderError ? err.message : err.stack ?? err}`);
  console.error("[prerender] Nothing should be deployed from this dist/ folder.");
  process.exit(1);
});
