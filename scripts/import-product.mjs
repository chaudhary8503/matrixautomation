#!/usr/bin/env node
/**
 * Import products from a manufacturer's website into the Matrix catalogue.
 *
 * Two steps, so nothing reaches your website without you checking it first:
 *
 *   1) EXTRACT  – opens each product page in a hidden browser (the pages are built
 *                 by JavaScript, so a plain download wouldn't see the details) and
 *                 saves name, description, specifications, images and PDF links
 *                 to a JSON file you can review and edit.
 *
 *        node scripts/import-product.mjs extract <url> [more urls…] [--out imports/file.json] [--debug]
 *        node scripts/import-product.mjs extract --list urls.txt
 *
 *   2) UPLOAD   – signs in as your admin user (same permissions as the admin panel),
 *                 uploads the images/PDFs to your storage and creates the products.
 *                 New products are saved as HIDDEN (not published) unless --publish.
 *
 *        node scripts/import-product.mjs upload imports/file.json \
 *             --brand moore-industries --category temperature-transmitter [--publish] [--update] [--dry-run]
 *
 *      --update   if a product with the same web address already exists, fill it in
 *                 with the extracted data instead of skipping it
 *      --dry-run  show what would happen, change nothing
 *
 *   ALL-IN-ONE – open a page that lists products, open every product on it, extract them,
 *                then (after you type "yes") upload them all:
 *
 *        node scripts/import-product.mjs import-all <listing-page-url> \
 *             --brand "Moore Industries" --category "Temperature Transmitter" [--publish] [--update]
 *
 *      --match "<text>"  only follow links containing this (a regular expression), if the
 *                        script picks up the wrong links. Default: Moore model pages.
 *      --max 200         safety limit on how many products to open
 *      --yes             don't ask before uploading
 *      --more-text "<text>"  the label of the site's "show more" button, if it isn't
 *                        "Show more" / "Load more" / "View all" (a regular expression)
 *      --no-more         don't click "show more" buttons
 *
 * Needs: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env (already there),
 *        Playwright's Chromium (npx playwright install chromium – once).
 * Admin login: asked for when uploading (or set ADMIN_EMAIL / ADMIN_PASSWORD).
 */

import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ helpers */

const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = () => {
  const out = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      if (["out", "list", "brand", "category", "match", "max", "more-text"].includes(args[i].slice(2))) i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
};

export const log = (...m) => console.log(...m);
export const die = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

/** Same rules as the admin panel and the database check. */
export function slugify(s) {
  return (
    String(s)
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\+/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 80)
      .replace(/-+$/g, "") || "item"
  );
}

export function loadEnv() {
  const file = path.resolve(".env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const url = process.env.VITE_SUPABASE_URL?.replace(/\/(rest|auth|storage)\/v1\/?$/, "").replace(/\/+$/, "");
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) die("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing — run this from the project folder (where .env is).");
  return { url, key };
}

export function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else if (!/[\r\n]/.test(s)) rl.output.write("*");
        else rl.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

/* ------------------------------------------------------------------ extract */

/** Runs inside the product page. Collects everything useful, with several fallbacks. */
function scrapeInPage() {
  const clean = (s) => (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const inChrome = (el) => !!el.closest("header, nav, footer, [role=navigation], .navbar, .menu, .breadcrumb, #footer, #header");

  const h1 = clean(document.querySelector("h1")?.textContent);
  const metaDesc = clean(document.querySelector('meta[name="description"]')?.getAttribute("content"));
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null;

  // Model / part number, e.g. "Model: TDZ3/PRG/4-20mA/12-42DC [BH2NG]"
  let model = null;
  for (const el of document.querySelectorAll("h1, h2, h3, h4, p, span, div, td, li")) {
    if (el.children.length > 3) continue;
    const m = clean(el.textContent).match(/^(?:model|part\s*(?:no\.?|number)|order(?:ing)?\s*code)\s*[:#]\s*(.{3,120})$/i);
    if (m) {
      model = m[1];
      break;
    }
  }

  const specs = [];
  const seen = new Set();
  const add = (label, value) => {
    label = clean(label).replace(/:$/, "").replace(/\s+Description$/i, "");
    value = clean(value);
    if (!label || !value || label.length > 80 || value.length > 600) return;
    if (/^(model|part\s*(no\.?|number)|phone|tel|email|e-mail|fax|address)$/i.test(label)) return;
    const k = label.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    specs.push({ label, value });
  };

  // 1) Two-column table rows
  for (const tr of document.querySelectorAll("table tr")) {
    if (inChrome(tr)) continue;
    const cells = [...tr.querySelectorAll(":scope > th, :scope > td")];
    if (cells.length === 2) add(cells[0].textContent, cells[1].textContent);
  }
  // 2) Definition lists
  for (const dt of document.querySelectorAll("dl dt")) {
    if (inChrome(dt)) continue;
    const dd = dt.nextElementSibling;
    if (dd?.tagName === "DD") add(dt.textContent, dd.textContent);
  }
  // 3) "Label: value" lines in small elements
  for (const el of document.querySelectorAll("li, p, div, span")) {
    if (inChrome(el) || el.querySelector("li, p, div, table")) continue;
    const t = clean(el.textContent);
    const m = t.match(/^([A-Za-z0-9][^:]{1,60}):\s*(.+)$/);
    if (m && !/^https?$/i.test(m[1])) add(m[1], m[2]);
  }
  // 4) Label element followed by a value element (common in configurators)
  for (const el of document.querySelectorAll("label, strong, b, .label, [class*='label' i]")) {
    if (inChrome(el)) continue;
    const label = clean(el.textContent);
    if (!/:$/.test(label)) continue;
    const next = el.nextElementSibling || el.parentElement?.nextElementSibling;
    if (next) add(label, next.textContent);
  }

  // Description: subtitle near the H1 + meta description + feature bullets
  const descParts = [];
  const h1El = document.querySelector("h1");
  const sub = h1El?.nextElementSibling;
  if (sub && /^(H2|H3|P|DIV)$/.test(sub.tagName)) {
    const t = clean(sub.textContent);
    if (t && t.length < 200 && !/^model\s*:/i.test(t)) descParts.push(t);
  }
  if (metaDesc && !/^find the solution/i.test(metaDesc)) descParts.push(metaDesc.replace(/\s*Find the solution to all.*$/i, ""));
  const features = [];
  for (const h of document.querySelectorAll("h2, h3, h4, strong")) {
    if (inChrome(h) || !/feature|benefit|highlight/i.test(h.textContent)) continue;
    let list = h.nextElementSibling;
    while (list && !/^(UL|OL)$/.test(list.tagName) && list.nextElementSibling && !/^H[1-4]$/.test(list.tagName)) list = list.nextElementSibling;
    if (list && /^(UL|OL)$/.test(list.tagName)) for (const li of list.querySelectorAll("li")) features.push(clean(li.textContent));
  }

  // Images: product photos first; logos, icons and site graphics left out.
  const LOGO_RE = /logo|worldwide|brand-mark|icon|sprite|spinner|progress|loading|print_page|email_go|3d-icon|video-thumb|flag|banner|badge|social|facebook|linkedin|twitter|youtube/i;
  const isHomeLink = (a) => {
    if (!a) return false;
    try {
      const u = new URL(a.getAttribute("href"), location.href);
      return u.origin === location.origin && (u.pathname === "/" || /^\/(index\.html?)?$/i.test(u.pathname));
    } catch {
      return false;
    }
  };
  const candidates = new Map(); // url -> score
  const addImg = (src, { el, score = 0 } = {}) => {
    if (!src) return;
    let abs;
    try {
      abs = new URL(src, location.href).href;
    } catch {
      return;
    }
    if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(abs)) return;
    if (LOGO_RE.test(abs.split(/[?#]/)[0].split("/").slice(-2).join("/"))) return; // logo-ish file name
    if (el) {
      if (inChrome(el) || isHomeLink(el.closest("a"))) return; // header logo / link to home page
      if (LOGO_RE.test(`${el.getAttribute("alt") ?? ""} ${el.className ?? ""} ${el.id ?? ""}`)) return;
      const r = el.getBoundingClientRect();
      score += Math.min(50, Math.round((r.width * r.height) / 5000)); // bigger = more likely the product photo
    }
    if (/\/products?\//i.test(abs)) score += 100; // e.g. /images/products/TDZ3-bh.jpg
    candidates.set(abs, Math.max(candidates.get(abs) ?? -Infinity, score));
  };
  for (const img of document.querySelectorAll("img")) {
    const w = img.naturalWidth || img.width;
    const src = img.currentSrc || img.src || img.getAttribute("data-src");
    if (/\/products?\//i.test(src ?? "") || w >= 150) addImg(src, { el: img });
  }
  for (const a of document.querySelectorAll("a[href]")) {
    if (/\.(jpe?g|png|webp)(\?|$)/i.test(a.href) && /\/products?\//i.test(a.href)) addImg(a.href, { el: a, score: 5 });
  }
  // The share image is often the site logo, so it only counts if nothing better exists.
  if (ogImage) addImg(ogImage, { score: -20 });
  const images = [...candidates.entries()].sort((x, y) => y[1] - x[1]).map(([u]) => u);

  // PDFs: datasheets / manuals
  const pdfs = [];
  for (const a of document.querySelectorAll("a[href]")) {
    if (!/\.pdf(\?|#|$)/i.test(a.href)) continue;
    const title = clean(a.textContent) || decodeURIComponent(a.href.split("/").pop().split(/[?#]/)[0]);
    if (!pdfs.some((p) => p.url === a.href)) pdfs.push({ title, url: a.href });
  }

  return { h1, model, descParts, features, specs, images, pdfs, title: document.title };
}

export async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    die("Playwright is not installed. Run: npm install -D playwright && npx playwright install chromium");
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  return { browser, page };
}

/** Opens a page and waits until its JavaScript-built content has appeared. */
async function loadPage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page
    .waitForFunction(() => !/loading products|loading\.\.\./i.test(document.body.innerText), null, { timeout: 30_000 })
    .catch(() => log("  ! page still says 'Loading…' after 30 s — results may be incomplete"));
  // Scroll down so lazily-loaded lists and images appear.
  await page.evaluate(async () => {
    for (let i = 0; i < 15; i++) {
      const before = document.body.scrollHeight;
      window.scrollTo(0, before);
      await new Promise((r) => setTimeout(r, 400));
      if (document.body.scrollHeight === before) break;
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1000);
}

/**
 * Listing pages often show the first ~15 products with a "Show more" / "Load more" button.
 * Keep clicking it until it disappears or no new products appear.
 */
async function expandListing(page, matchRe) {
  const custom = option("more-text");
  const textRe = custom ? new RegExp(custom, "i") : /^\s*(show|load|view|see)\s+(\d+\s+)?(more|all)\b|^\s*more\s+(products|results|items)\b|^\s*next\s+\d+\b/i;
  let clicks = 0;
  let count = (await productLinks(page, matchRe)).length;
  for (let round = 0; round < 100; round++) {
    const button = page
      .locator("button, a, [role=button], input[type=button], input[type=submit], span, div")
      .filter({ hasText: textRe })
      .filter({ visible: true })
      .last();
    if (!(await button.count())) break;
    // Skip big containers that merely include the text; we want the actual button.
    const small = await button.evaluate((el) => el.textContent.trim().length < 40).catch(() => false);
    if (!small) break;
    try {
      await button.scrollIntoViewIfNeeded({ timeout: 5000 });
      await button.click({ timeout: 10_000 });
    } catch {
      break;
    }
    clicks++;
    // Wait for new products to appear (up to ~15 s), then continue.
    let grew = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      const now = (await productLinks(page, matchRe)).length;
      if (now > count) {
        count = now;
        grew = true;
        await page.waitForTimeout(500);
        break;
      }
    }
    log(`  clicked "show more" (${clicks}) — ${count} product link(s) so far`);
    if (!grew) break;
  }
  return clicks;
}

const DEFAULT_PRODUCT_LINK = /\/catalog\/[^/?#]+\/[^/?#]*_[^/?#]*$/i; // Moore model pages, e.g. /catalog/tdz3/TDZ3_PRG_..._temp

/** Product links on the currently loaded page (header, menus and footer ignored). */
async function productLinks(page, matchRe) {
  const all = await page.$$eval("a[href]", (as) =>
    as
      .filter((a) => !a.closest("header, nav, footer, [role=navigation], .navbar, .menu, .breadcrumb, #footer, #header"))
      .map((a) => a.href.split("#")[0]),
  );
  const origin = new URL(page.url()).origin;
  return [...new Set(all)].filter((h) => h.startsWith(origin) && h !== page.url() && (matchRe ?? DEFAULT_PRODUCT_LINK).test(h));
}

/** Extracts each URL; family pages (no single model) are expanded into their models when follow=true. */
async function extractUrls(page, urls, { out, debug, follow, matchRe }) {
  const results = [];
  const queue = [...urls];
  const seen = new Set();
  let n = 0;
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    n++;
    log(`\n[${n}/${n + queue.length}] ${url}`);
    try {
      await loadPage(page, url);

      if (debug) {
        const base = path.join(path.dirname(out), `debug-${slugify(url).slice(-60)}`);
        await fs.writeFile(`${base}.html`, await page.content());
        await page.screenshot({ path: `${base}.png`, fullPage: true });
        log(`  debug: saved ${base}.html and .png`);
      }

      const d = await page.evaluate(scrapeInPage);

      // A product FAMILY page lists several models and has no single model number.
      // It isn't a product itself: open its models instead (or save the list).
      if (!d.model) {
        if (follow && !flag("no-more")) await expandListing(page, matchRe);
        const variants = await productLinks(page, matchRe);
        if (variants.length) {
          if (follow) {
            const fresh = variants.filter((v) => !seen.has(v) && !queue.includes(v));
            queue.push(...fresh);
            log(`  i product list page — added ${fresh.length} product link(s) to open`);
          } else {
            const listFile = path.join(path.dirname(out), "variant-urls.txt");
            await fs.writeFile(listFile, variants.join("\n") + "\n");
            log(`  i product family page with ${variants.length} model(s) — not imported itself.`);
            log(`    Model links saved to ${listFile}. To import them all in one go use the "import-all" command.`);
          }
          continue;
        }
      }

      const name = d.model || d.h1 || d.title;
      const descLines = [d.h1 && d.model ? d.h1 : null, ...d.descParts].filter(Boolean);
      if (d.features.length) descLines.push(...d.features.map((f) => `• ${f}`));
      const item = {
        source_url: url,
        name,
        slug: slugify(name),
        description: [...new Set(descLines)].join("\n") || null,
        specs: d.specs,
        images: d.images.slice(0, 6),
        datasheet_url: d.pdfs.find((p) => /data\s*sheet|datasheet/i.test(p.title + p.url))?.url ?? d.pdfs[0]?.url ?? null,
        pdfs: d.pdfs,
      };
      if (results.some((r) => r.slug === item.slug)) {
        log(`  = duplicate of an earlier page (${item.name}) — skipped`);
        continue;
      }
      results.push(item);
      log(`  ${item.name} — ${item.specs.length} specs, ${item.images.length} image(s), ${item.pdfs.length} pdf(s)`);
      if (!item.specs.length) log("  ! no specifications found — run again with --debug and check the saved HTML/screenshot");
    } catch (e) {
      log(`  ✖ failed: ${e.message}`);
    }
    await page.waitForTimeout(700); // be polite to their server
  }
  return results;
}

const defaultOut = (prefix = "import") => `imports/${prefix}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
const matchOption = () => {
  const m = option("match");
  try {
    return m ? new RegExp(m, "i") : undefined;
  } catch {
    die(`--match "${m}" is not a valid pattern.`);
  }
};

async function extract() {
  let urls = positional();
  const listFile = option("list");
  if (listFile) urls.push(...(await fs.readFile(listFile, "utf8")).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  urls = [...new Set(urls)];
  if (!urls.length) die("Give at least one product page URL (or --list urls.txt).");

  const out = option("out") ?? defaultOut();
  await fs.mkdir(path.dirname(out), { recursive: true });
  const { browser, page } = await launchBrowser();
  const results = await extractUrls(page, urls, { out, debug: flag("debug"), follow: flag("follow"), matchRe: matchOption() });
  await browser.close();
  await fs.writeFile(out, JSON.stringify(results, null, 2) + "\n");
  log(`\n✔ Saved ${results.length} product(s) to ${out}`);
  log("  Open it, check/edit the names, descriptions and specs, then run the upload step.\n");
}

/**
 * import-all: open a listing page, open every product linked from it, extract each one,
 * save everything to a JSON file, then (after you confirm) upload them all.
 */
async function importAll() {
  const [startUrl] = positional();
  if (!startUrl) die('Usage: import-all <listing-page-url> --brand "<brand>" --category "<category>" [--publish] [--update]');
  if (!option("brand") || !option("category")) die('Please give --brand "<brand>" and --category "<category>".');
  const matchRe = matchOption();
  const max = Number(option("max") ?? 200);

  const out = option("out") ?? defaultOut(`import-all-${slugify(new URL(startUrl).pathname).slice(0, 40)}`);
  await fs.mkdir(path.dirname(out), { recursive: true });

  const { browser, page } = await launchBrowser();
  log(`\nOpening listing page: ${startUrl}`);
  try {
    await loadPage(page, startUrl);
  } catch (e) {
    await browser.close();
    die(`Could not open ${startUrl}: ${e.message.split("\n")[0]}`);
  }
  if (!flag("no-more")) await expandListing(page, matchRe);
  let links = await productLinks(page, matchRe);
  if (!links.length) {
    // Maybe the page itself is a single product.
    const d = await page.evaluate(scrapeInPage);
    if (d.model) links = [startUrl];
  }
  if (!links.length) {
    await browser.close();
    die(
      "No product links found on that page.\n  Run with --debug on extract to see the page, or tell the script which links are products with\n" +
        '  --match "<part of the product link>", e.g. --match "/catalog/tdz3/"',
    );
  }
  if (links.length > max) {
    log(`  ! found ${links.length} product links — only the first ${max} will be imported (change with --max)`);
    links = links.slice(0, max);
  }
  const listFile = out.replace(/\.json$/, "-links.txt");
  await fs.writeFile(listFile, links.join("\n") + "\n");
  log(`Found ${links.length} product link(s) (saved to ${listFile}).`);

  const results = await extractUrls(page, links, { out, debug: flag("debug"), follow: true, matchRe });
  await browser.close();
  await fs.writeFile(out, JSON.stringify(results, null, 2) + "\n");

  const noSpecs = results.filter((r) => !r.specs.length).length;
  log(`\n✔ Extracted ${results.length} product(s) → ${out}${noSpecs ? `  (${noSpecs} without specs)` : ""}`);
  if (!results.length) die("Nothing to upload.");

  if (!flag("yes")) {
    log("  You can open that file now and edit or delete products before continuing.");
    const answer = (await ask(`\nUpload these ${results.length} product(s) now? Type "yes" to continue, anything else to stop: `)).toLowerCase();
    if (answer !== "yes" && answer !== "y") {
      log(`\nStopped. Nothing was uploaded. To upload later (after editing the file if you like):`);
      log(`  node scripts/import-product.mjs upload ${out} --brand "${option("brand")}" --category "${option("category")}"${flag("publish") ? " --publish" : ""}${flag("update") ? " --update" : ""}\n`);
      return;
    }
  }
  // Re-read the file so any edits made while the prompt was waiting are used.
  const items = JSON.parse(await fs.readFile(out, "utf8"));
  await uploadItems(items, {
    brandArg: option("brand"),
    categoryArg: option("category"),
    dry: flag("dry-run"),
    publish: flag("publish"),
    update: flag("update"),
  });
}

/* ------------------------------------------------------------------- upload */

const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf" };

export async function download(url, maxBytes) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Matrix catalogue import)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`file too large (${(buf.length / 1048576).toFixed(1)} MB)`);
  let ext = (url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? "").toLowerCase();
  const ct = res.headers.get("content-type")?.split(";")[0];
  if (!MIME[ext]) ext = Object.entries(MIME).find(([, m]) => m === ct)?.[0] ?? "bin";
  return { buf, ext, type: MIME[ext] ?? ct ?? "application/octet-stream" };
}

async function upload() {
  const [file] = positional();
  if (!file) die('Usage: upload <file.json> --brand "<brand>" --category "<category>"');
  if (!option("brand") || !option("category")) die('Please give --brand "<brand>" and --category "<category>" (name or web address, as in the admin panel).');
  const items = JSON.parse(await fs.readFile(file, "utf8"));
  if (!Array.isArray(items) || !items.length) die(`${file} has no products.`);
  await uploadItems(items, {
    brandArg: option("brand"),
    categoryArg: option("category"),
    dry: flag("dry-run"),
    publish: flag("publish"),
    update: flag("update"),
  });
}

export async function uploadItems(items, { brandArg: brandSlug, categoryArg: categorySlug, dry, publish, update, createCategories = false, downloader = download }) {
  const { url, key } = loadEnv();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const email = process.env.ADMIN_EMAIL || (await ask("Admin email: "));
  const password = process.env.ADMIN_PASSWORD || (await ask("Admin password: ", { hidden: true }));
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) die(`Sign-in failed: ${authError.message}`);
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) die(`${email} is not an administrator.`);

  // Accept the web address (slug) or the name, ignoring case and spaces/dashes.
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const pick = async (table, wanted, label) => {
    const { data, error } = await supabase.from(table).select("id, name, slug").order("name");
    if (error) die(`Could not load ${table}: ${error.message}`);
    const hit = data.find((r) => r.slug === wanted) ?? data.find((r) => norm(r.slug) === norm(wanted) || norm(r.name) === norm(wanted));
    if (!hit) die(`${label} "${wanted}" not found. Use one of these:\n${data.map((r) => `   ${r.slug.padEnd(40)} (${r.name})`).join("\n")}`);
    return hit;
  };
  const brand = await pick("brands", brandSlug, "Brand");

  // Categories: one for the whole run (--category), or per product (item.category),
  // optionally created when missing (used by the Rockwell importer: "HMI - PanelView Plus 7" …).
  const { data: catRows, error: catErr } = await supabase.from("categories").select("id, name, slug, sort_order").order("name");
  if (catErr) die(`Could not load categories: ${catErr.message}`);
  const findCat = (wanted) => catRows.find((r) => r.slug === wanted) ?? catRows.find((r) => norm(r.slug) === norm(wanted) || norm(r.name) === norm(wanted));
  const defaultCategory = categorySlug ? findCat(categorySlug) : null;
  if (categorySlug && !defaultCategory && !createCategories)
    die(`Category "${categorySlug}" not found. Use one of these:\n${catRows.map((r) => `   ${r.slug.padEnd(40)} (${r.name})`).join("\n")}`);
  let catSort = Math.max(0, ...catRows.map((r) => r.sort_order ?? 0)) + 10;
  const createdCats = [];
  const resolveCategory = async (wanted) => {
    if (!wanted) return defaultCategory;
    const hit = findCat(wanted);
    if (hit) return hit;
    if (!createCategories) throw new Error(`category "${wanted}" does not exist`);
    const row = { name: String(wanted).trim(), slug: slugify(wanted), sort_order: catSort };
    catSort += 10;
    if (dry) {
      const fake = { ...row, id: `(new) ${row.slug}` };
      catRows.push(fake);
      createdCats.push(row.name);
      log(`  + would create category "${row.name}"`);
      return fake;
    }
    const { data, error } = await supabase.from("categories").insert(row).select("id, name, slug, sort_order").single();
    if (error) throw new Error(`could not create category "${row.name}": ${error.message}`);
    catRows.push(data);
    createdCats.push(data.name);
    log(`  + created category "${data.name}"`);
    return data;
  };
  log(`\nBrand: ${brand.name}   Category: ${defaultCategory ? defaultCategory.name : categorySlug ? `${categorySlug} (new)` : "per product"}   ${dry ? "(DRY RUN — nothing will change)" : ""}`);

  const { data: last } = await supabase.from("products").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  let sortOrder = (last?.[0]?.sort_order ?? 0) + 10;

  const stamp = () => Date.now().toString(36);
  const stored = new Map(); // source URL -> our URL, so a shared photo/datasheet is uploaded once
  const failed = new Map(); // source URL -> error, so a broken shared file isn't retried for every product
  const storeFile = async (bucket, folder, srcUrl, baseName) => {
    if (stored.has(srcUrl)) return stored.get(srcUrl);
    if (failed.has(srcUrl)) throw failed.get(srcUrl);
    try {
      return await storeFileOnce(bucket, folder, srcUrl, baseName);
    } catch (e) {
      failed.set(srcUrl, e);
      throw e;
    }
  };
  const storeFileOnce = async (bucket, folder, srcUrl, baseName) => {
    const { buf, ext, type } = await downloader(srcUrl, bucket === "images" ? 5 * 1048576 : 20 * 1048576);
    if (bucket === "images" && !type.startsWith("image/")) throw new Error(`not an image (${type})`);
    if (bucket === "documents" && type !== "application/pdf") throw new Error(`not a PDF (${type})`);
    const p = `${folder}/${stamp()}-${slugify(baseName).slice(0, 50)}.${ext}`;
    if (dry) {
      const planned = `(would upload ${srcUrl} → ${bucket}/${p})`;
      stored.set(srcUrl, planned);
      return planned;
    }
    const { error } = await supabase.storage.from(bucket).upload(p, buf, { contentType: type, cacheControl: "31536000", upsert: false });
    if (error) throw error;
    const publicUrl = supabase.storage.from(bucket).getPublicUrl(p).data.publicUrl;
    stored.set(srcUrl, publicUrl);
    return publicUrl;
  };

  const summary = { created: 0, updated: 0, skipped: 0, failed: 0 };

  for (const item of items) {
    const name = String(item.name ?? "").trim();
    const slug = slugify(item.slug || name);
    log(`\n→ ${name}  (/products/${slug})`);
    if (!name) {
      log("  ✖ no name — skipped");
      summary.failed++;
      continue;
    }
    try {
      const { data: existing } = await supabase.from("products").select("id, image_url, datasheet_url").eq("slug", slug).maybeSingle();
      if (existing && !update) {
        log("  = already exists — skipped (use --update to fill it in with this data)");
        summary.skipped++;
        continue;
      }

      // Files first, so the product never points at a missing file.
      const imageUrls = [];
      for (const [i, src] of (item.images ?? []).entries()) {
        try {
          imageUrls.push(await storeFile("images", `products/${brand.slug}`, src, `${name}-${i + 1}`));
        } catch (e) {
          log(`  ! image skipped (${src}): ${e.message}`);
        }
      }
      let datasheetUrl = null;
      if (item.datasheet_url) {
        try {
          datasheetUrl = await storeFile("documents", `datasheets/${brand.slug}`, item.datasheet_url, `${name}-datasheet`);
        } catch (e) {
          log(`  ! datasheet skipped (${item.datasheet_url}): ${e.message}`);
        }
      }

      const specs = (item.specs ?? [])
        .map((s) => ({ label: String(s.label ?? "").trim(), value: String(s.value ?? "").trim() }))
        .filter((s) => s.label && s.value);

      const category = await resolveCategory(item.category || categorySlug);
      if (!category) throw new Error("no category given");
      const row = {
        name,
        slug,
        brand_id: brand.id,
        category_id: category.id,
        description: item.description?.trim() || null,
        specs,
        ...(imageUrls[0] ? { image_url: imageUrls[0] } : {}),
        ...(datasheetUrl ? { datasheet_url: datasheetUrl } : {}),
      };

      if (dry) {
        log(`  would ${existing ? "UPDATE" : "CREATE"}: ${specs.length} specs, ${imageUrls.length} image(s), datasheet: ${datasheetUrl ? "yes" : "no"}`);
        existing ? summary.updated++ : summary.created++;
        continue;
      }

      let productId;
      if (existing) {
        const { error } = await supabase.from("products").update(row).eq("id", existing.id);
        if (error) throw error;
        productId = existing.id;
        summary.updated++;
        log(`  ✔ updated (${specs.length} specs, ${imageUrls.length} image(s)${datasheetUrl ? ", datasheet" : ""})`);
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({ ...row, is_published: publish, sort_order: sortOrder })
          .select("id")
          .single();
        if (error) throw error;
        productId = data.id;
        sortOrder += 10;
        summary.created++;
        log(`  ✔ created as ${publish ? "PUBLISHED" : "HIDDEN (publish it in Admin → Products after checking)"} — ${specs.length} specs, ${imageUrls.length} image(s)${datasheetUrl ? ", datasheet" : ""}`);
      }

      // Extra photos go to the gallery. When updating, the gallery is replaced, so photos
      // from an earlier import (e.g. a logo picked up by mistake) don't linger.
      const extra = imageUrls.slice(1);
      if (existing && imageUrls.length) {
        const { error } = await supabase.from("product_images").delete().eq("product_id", productId);
        if (error) log(`  ! old gallery not cleared: ${error.message}`);
      }
      if (extra.length) {
        const { data: have } = await supabase.from("product_images").select("url, sort_order").eq("product_id", productId);
        let so = Math.max(0, ...(have ?? []).map((h) => h.sort_order)) + 10;
        for (const u of extra) {
          const { error } = await supabase.from("product_images").insert({ product_id: productId, url: u, sort_order: so });
          if (error) log(`  ! gallery image not saved: ${error.message}`);
          so += 10;
        }
      }
    } catch (e) {
      summary.failed++;
      const msg = e?.code === "23505" ? "a product with this web address already exists" : e?.message ?? String(e);
      log(`  ✖ failed: ${msg}`);
    }
  }

  await supabase.auth.signOut();
  if (createdCats.length) log(`\nCategories ${dry ? "that would be " : ""}created: ${createdCats.join(", ")}`);
  log(`\nDone — created ${summary.created}, updated ${summary.updated}, skipped ${summary.skipped}, failed ${summary.failed}${dry ? " (dry run)" : ""}.`);
  if (!dry && summary.created && !publish) log("New products are HIDDEN. Check them in Admin → Products (filter: Hidden), then switch Published on.");
  log("");
}

/* --------------------------------------------------------------------- main */

import { pathToFileURL } from "node:url";
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (!runDirectly) {
  // imported by another script (e.g. import-rockwell.mjs): don't run the CLI
} else if (command === "extract") await extract();
else if (command === "upload") await upload();
else if (command === "import-all") await importAll();
else {
  log(`Usage:
  node scripts/import-product.mjs import-all <listing-page-url> --brand "<brand>" --category "<category>" [--publish] [--update] [--match "<text>"] [--max 200] [--yes]
  node scripts/import-product.mjs extract <url> [more urls] [--out imports/file.json] [--debug] [--follow]
  node scripts/import-product.mjs extract --list urls.txt
  node scripts/import-product.mjs upload imports/file.json --brand <brand-slug> --category <category-slug> [--publish] [--update] [--dry-run]`);
  process.exit(command ? 1 : 0);
}
