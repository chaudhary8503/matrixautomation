#!/usr/bin/env node
// Smoke test: clicks through the built site the way visitors do, in a real browser.
//
//   npm run build && npm run prerender && npm run smoke
//
// dist/ is served exactly like public/.htaccess serves it on cPanel (snapshot pages, 200.html
// fallback, 404 for missing /assets/ files), because that's where the app boots differently from
// `npm run dev` / `vite preview`. A crash that only happens on the live site (like React error
// #311 after the first click on a prerendered page) fails this script, and with it the deploy.
//
// Checks, on desktop and mobile: every page loads, client-side navigation (header nav, cards,
// mobile menu, search, filters, back/forward) never white-screens or throws, the 404 page and the
// admin sign-in page render, public pages never download admin code, and a code file deleted by
// a deploy shows a message instead of a white screen.

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const DIST = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "dist");
const TIMEOUT = 30_000;
const started = Date.now();
const failures = [];
const warnings = new Set();
const ATTEMPTS = 3;
const log = (...a) => console.log("[smoke]", ...a);

/* --------------------------------------------------------------- server -- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};
const isFile = (f) => {
  try {
    return statSync(f).isFile();
  } catch {
    return false;
  }
};

/** Same rules as public/.htaccess. `blocked` simulates code files removed by a newer deploy. */
function startServer({ spa = false, blocked = new Set() } = {}) {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/(.)\/+$/, "$1");
    const send = (file, status = 200) => {
      res.writeHead(status, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
    };
    const file = path.join(DIST, urlPath);
    if (!file.startsWith(DIST)) return res.writeHead(400).end();
    if (blocked.has(urlPath)) return res.writeHead(404).end("Not found");
    if (urlPath !== "/" && isFile(file)) return send(file); // 3. real files
    if (urlPath.startsWith("/assets/")) return res.writeHead(404).end("Not found"); // 3b
    if (!spa && urlPath === "/") return send(path.join(DIST, "index.html")); // 4. home snapshot
    if (!spa && isFile(path.join(file, "index.html"))) return send(path.join(file, "index.html")); // 5. snapshot
    send(path.join(DIST, "200.html")); // 6. app shell
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })),
  );
}

/* -------------------------------------------------------------- helpers -- */

const BUSY = '[aria-busy="true"], .animate-pulse';

/** Opens a page and records every JavaScript error and failed request on it. */
async function open(context, origin, route) {
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (err) => problems.push(`JavaScript error: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/Failed to load resource/.test(msg.text())) problems.push(`console.error: ${msg.text()}`);
  });
  // Our own files and Supabase's API must never fail. A broken image or a third-party host
  // (e.g. a deleted Unsplash photo used as a category image) is content, not code: warn only.
  const critical = (r) => r.url().startsWith(origin) || r.url().includes("/rest/v1/");
  const report = (r, what) => {
    if (critical(r) && r.resourceType() !== "image") problems.push(`${what}: ${r.url()}`);
    else warnings.add(`${what}: ${r.url()}`);
  };
  page.on("response", (r) => r.status() >= 400 && report(r, `HTTP ${r.status()}`));
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "";
    if (!/ERR_ABORTED/.test(reason)) report(r, `request failed (${reason})`);
  });
  page.pending = new Set();
  page.on("request", (r) => r.url().includes("/rest/v1/") && page.pending.add(r.url()));
  const done = (r) => page.pending.delete(r.url());
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  page.adminChunks = [];
  page.on("request", (r) => /\/assets\/(AdminApp|supabase)/i.test(r.url()) && page.adminChunks.push(r.url()));
  await page.goto(origin + route, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  return { page, problems };
}

/** Waits until a page has rendered: main heading present, nothing loading, no error message. */
async function settled(page, label) {
  await page
    .waitForFunction(
      (busy) => !!document.querySelector("#root main h1") && !document.querySelector(busy),
      BUSY,
      { timeout: TIMEOUT },
    )
    .catch(() => {});
  const state = await page.evaluate(() => ({
    path: location.pathname,
    h1: document.querySelector("#root main h1")?.textContent?.trim() ?? null,
    white: !document.querySelector("#root main"),
    error: !!document.querySelector("#root [data-error-state]"),
  }));
  if (state.white) throw new Error(`${label}: WHITE SCREEN at ${state.path}`);
  if (state.error) throw new Error(`${label}: error message shown at ${state.path}`);
  if (!state.h1) {
    const pending = [...(page.pending ?? [])].map((u) => u.split("/rest/v1/")[1]?.slice(0, 80));
    throw new Error(
      `${label}: page never finished rendering at ${state.path}` +
        (pending.length ? ` (Supabase requests still pending: ${pending.join(", ")})` : ""),
    );
  }
  return state;
}

/** Called before every attempt: gives each attempt brand-new browser contexts (own cookies,
 *  cache and network connections), so a retry never inherits a stuck connection. */
let freshContexts = null;

/** Runs a check; if it fails, tries again (up to 3 times, fresh browser each time), so a network
 *  blip talking to the real Supabase doesn't block a deploy. A real bug fails every time. */
async function scenario(name, fn) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const t = Date.now();
    try {
      await freshContexts?.();
      await fn();
      log(`ok   ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${attempt > 1 ? " — passed on retry" : ""}`);
      return;
    } catch (err) {
      if (attempt === ATTEMPTS) {
        failures.push(`${name}: ${err.message}`);
        log(`FAIL ${name}: ${err.message}`);
      } else {
        log(`retry ${name}: ${err.message}`);
      }
    }
  }
}

/** Clicks a link and checks the next page renders, at the expected path. */
async function clickTo(page, selector, expectPath, label) {
  const link = page.locator(selector).first();
  await link.waitFor({ state: "visible", timeout: TIMEOUT });
  await link.click();
  await page.waitForURL((u) => expectPath.test(u.pathname), { timeout: TIMEOUT });
  return settled(page, label);
}

function assertClean(problems, page, label) {
  if (problems.length) throw new Error(`${label}:\n      ${[...new Set(problems)].slice(0, 5).join("\n      ")}`);
  if (page.adminChunks.length) throw new Error(`${label}: public page downloaded admin code ${page.adminChunks[0]}`);
}

/* ---------------------------------------------------------------- tests -- */

async function run(browser, mode) {
  const { server, origin } = await startServer({ spa: mode === "spa" });
  let desktop = null;
  let mobile = null;
  freshContexts = async () => {
    await desktop?.close();
    await mobile?.close();
    desktop = await browser.newContext({ viewport: { width: 1366, height: 850 } });
    mobile = await browser.newContext({ ...devices["Pixel 7"] });
  };
  const tag = mode === "spa" ? "[no snapshots]" : "[snapshots]";

  try {
    // Every public page loads on its own.
    await scenario(`${tag} direct loads`, async () => {
      for (const route of ["/", "/who-we-are", "/products", "/brands", "/industries", "/contact"]) {
        const { page, problems } = await open(desktop, origin, route);
        await settled(page, route);
        assertClean(problems, page, route);
        await page.close();
      }
    });

    // The exact bug from production: first click after opening a page. From every kind of page.
    await scenario(`${tag} desktop: header navigation through every page`, async () => {
      const { page, problems } = await open(desktop, origin, "/");
      await settled(page, "home");
      for (const [href, re] of [
        ["/who-we-are", /^\/who-we-are$/],
        ["/products", /^\/products$/],
        ["/brands", /^\/brands$/],
        ["/industries", /^\/industries$/],
        ["/contact", /^\/contact$/],
        ["/", /^\/$/],
      ]) {
        await clickTo(page, `header nav[aria-label="Main"] a[href="${href}"]`, re, `nav → ${href}`);
      }
      assertClean(problems, page, "header navigation");
      await page.close();
    });

    await scenario(`${tag} desktop: home → products → product → brand → back → forward`, async () => {
      const { page, problems } = await open(desktop, origin, "/");
      await settled(page, "home");
      await clickTo(page, 'main a[href="/products"]', /^\/products$/, "home → products");
      // Category filter (stays on the page, changes ?cat=)
      const chip = page.locator('main [role="group"] button').nth(1);
      if (await chip.count()) {
        await chip.click();
        await page.waitForURL((u) => u.searchParams.has("cat"), { timeout: TIMEOUT });
        await settled(page, "category filter");
      }
      const product = await clickTo(page, 'main a[href^="/products/"]', /^\/products\/.+/, "products → product");
      await clickTo(page, 'main a[href^="/brands/"]', /^\/brands\/.+/, "product → brand");
      await page.goBack();
      const back = await settled(page, "back");
      if (back.path !== product.path) throw new Error(`back went to ${back.path}, expected ${product.path}`);
      await page.goForward();
      await settled(page, "forward");
      assertClean(problems, page, "product journey");
      await page.close();
    });

    // Starting on a product and a brand page (both prerendered), then navigating.
    await scenario(`${tag} desktop: start on product / brand page, then navigate`, async () => {
      for (const [start, re] of [
        ["product", /^\/products\/.+/],
        ["brand", /^\/brands\/.+/],
      ]) {
        const { page: listPage } = await open(desktop, origin, start === "product" ? "/products" : "/brands");
        await settled(listPage, "list");
        const href = await listPage.locator(`main a[href^="/${start === "product" ? "products" : "brands"}/"]`).first().getAttribute("href");
        await listPage.close();
        const { page, problems } = await open(desktop, origin, href);
        await settled(page, href);
        if (!re.test(new URL(page.url()).pathname)) throw new Error(`${href} redirected to ${page.url()}`);
        await clickTo(page, 'header nav[aria-label="Main"] a[href="/products"]', /^\/products$/, `${href} → products`);
        assertClean(problems, page, `start on ${start}`);
        await page.close();
      }
    });

    await scenario(`${tag} mobile: menu, search, product`, async () => {
      const { page, problems } = await open(mobile, origin, "/");
      await settled(page, "mobile home");
      await page.getByRole("button", { name: "Open menu" }).click();
      await clickTo(page, 'nav[aria-label="Mobile"] a[href="/brands"]', /^\/brands$/, "mobile menu → brands");
      // Header search: type part of a real product name, open the first hit.
      const { page: p2 } = await open(mobile, origin, "/products");
      await settled(p2, "products");
      const name = (await p2.locator("main h3").first().textContent())?.trim() ?? "";
      await p2.close();
      await page.locator('header button[aria-label="Search products"]').click();
      await page.locator('header input[aria-label="Search products"]').fill(name.slice(0, 4));
      const hit = page.locator("header ul button").first();
      await hit.waitFor({ state: "visible", timeout: TIMEOUT });
      await hit.click();
      await page.waitForURL((u) => /^\/products\/.+/.test(u.pathname), { timeout: TIMEOUT });
      await settled(page, "search result");
      assertClean(problems, page, "mobile journey");
      await page.close();
    });

    await scenario(`${tag} 404 page + admin sign-in`, async () => {
      const { page, problems } = await open(desktop, origin, "/this-page-does-not-exist");
      const s = await settled(page, "404");
      if (!/not found/i.test(s.h1)) throw new Error(`404 page shows "${s.h1}"`);
      const robots = await page.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute("content"));
      if (!robots?.includes("noindex")) throw new Error("404 page is not noindex");
      await clickTo(page, 'main a[href="/products"]', /^\/products$/, "404 → products");
      assertClean(problems, page, "404");
      await page.close();

      const admin = await open(desktop, origin, "/admin");
      await admin.page.getByRole("button", { name: /sign in/i }).waitFor({ timeout: TIMEOUT });
      const noindex = await admin.page.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute("content"));
      if (!noindex?.includes("noindex")) throw new Error("admin is not noindex");
      if (admin.problems.length) throw new Error(`admin: ${admin.problems[0]}`);
      await admin.page.close();
    });
  } finally {
    freshContexts = null;
    await desktop?.close();
    await mobile?.close();
    server.close();
  }
}

/** A tab opened before a deploy clicks a link whose code file no longer exists. */
async function staleDeploy(browser) {
  const contactChunk = (await import("node:fs")).readdirSync(path.join(DIST, "assets")).find((f) => /^Contact-.*\.js$/.test(f));
  if (!contactChunk) throw new Error("Contact chunk not found in dist/assets");
  const { server, origin } = await startServer({ blocked: new Set([`/assets/${contactChunk}`]) });
  const context = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  try {
    await scenario("[deploy] missing code file → message, not a white screen", async () => {
      const page = await context.newPage();
      await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
      await settled(page, "home");
      await page.locator('header nav[aria-label="Main"] a[href="/contact"]').click();
      // The app reloads once to fetch the new version; the file is still missing, so it then shows the message.
      await page.waitForSelector("#root [data-error-state]", { timeout: TIMEOUT });
      const ok = await page.evaluate(() => !!document.querySelector("#root header") && !!document.querySelector("#root footer"));
      if (!ok) throw new Error("header/footer disappeared");
      await page.close();
    });
  } finally {
    await context.close();
    server.close();
  }
}

/* ----------------------------------------------------------------- main -- */

if (!existsSync(path.join(DIST, "200.html"))) {
  console.error("[smoke] dist/200.html not found — run `npm run build && npm run prerender` first.");
  process.exit(1);
}
const browser = await chromium.launch();
try {
  await run(browser, "snapshots");
  await run(browser, "spa");
  await staleDeploy(browser);
} finally {
  await browser.close();
}
const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failures.length) {
  for (const w of warnings) log(`warning (not blocking): ${w}`);
  console.error(`\n[smoke] FAILED (${failures.length}) in ${secs}s:\n  - ${failures.join("\n  - ")}`);
  console.error("[smoke] Nothing should be deployed from this dist/ folder.");
  process.exit(1);
}
for (const w of warnings) log(`warning (not blocking): ${w}`);
log(`all checks passed in ${secs}s`);
