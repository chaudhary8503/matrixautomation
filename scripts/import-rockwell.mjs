#!/usr/bin/env node
/**
 * Import Rockwell Automation / Allen-Bradley products from a family page
 * (e.g. the HMI page) — every series on it, every product in each series.
 *
 *   node scripts/import-rockwell.mjs "<family page url>" --brand "Allen Bradley" [--publish] [--update]
 *
 * Example (all HMI series → categories "HMI - PanelView Plus 7", "HMI - PanelView 5000", …):
 *
 *   node scripts/import-rockwell.mjs "https://www.rockwellautomation.com/en-in/products/hardware/hmi.html" --brand "Allen Bradley" --publish --update
 *
 * How it works
 *   1. Opens the family page in a hidden browser and finds the series pages it links to.
 *   2. For each series, reads Rockwell's own product feed (the data behind the paged
 *      product grid) 100 products at a time until it has all of them — including
 *      discontinued products and accessories.
 *   3. Builds each product: catalog number, title, description, a specifications table,
 *      the product photo (or the series photo when Rockwell has none) and the
 *      technical-data PDF.
 *   4. Saves everything to imports/rockwell-….json, shows a summary per series, and asks
 *      before uploading. Categories that don't exist yet are created ("HMI - <series>").
 *
 * Options
 *   --prefix "HMI - "      text in front of each series name for the category (default "HMI - ")
 *   --only "plus-7,5000"   only series whose web address contains one of these words
 *   --skip "optixedge"     leave out series whose web address contains one of these words
 *   --active-only          leave out discontinued products
 *   --publish              new products go live immediately (otherwise they're saved hidden)
 *   --update               products that already exist are filled in / moved instead of skipped
 *   --dry-run              go through everything, change nothing on your site
 *   --yes                  don't ask before uploading
 *   --out imports/x.json   where to save the extracted data
 *   --headed               show the browser window while it works (useful if the site blocks it)
 *
 * Upload an already-extracted file later (e.g. after editing it):
 *   node scripts/import-rockwell.mjs upload imports/rockwell-….json --brand "Allen Bradley" [--publish] [--update] [--dry-run]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ask, die, log, slugify, uploadItems } from "./import-product.mjs";

/* ------------------------------------------------------------------ options */

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const option = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const VALUE_OPTS = ["brand", "prefix", "only", "skip", "out"];

const positional = () => {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      if (VALUE_OPTS.includes(args[i].slice(2))) i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
};
const words = (s) => (s ? s.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean) : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ORIGIN = process.env.RW_ORIGIN || "https://www.rockwellautomation.com"; // RW_ORIGIN only for testing
const REGIONS = ["in", "us", "ae", "gb"]; // the feed sometimes fails or is incomplete for one region
const PAGE_SIZE = 100;

/* --------------------------------------------------- pure helpers (tested) */

/** "2711P PanelView Plus 7 Graphic Terminals" → "PanelView Plus 7" */
export function seriesName(raw) {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*(allen[- ]bradley|rockwell automation)\s*$/i, "") // h1 ends with the brand on Rockwell's pages
    .replace(/^\d{4}[A-Z]{0,3}\s+/, "") // leading bulletin number, e.g. "2711P "
    .replace(/\s+(graphic|operator)\s+terminals?$/i, "")
    .replace(/\s+terminals?$/i, "")
    .trim();
}

const LIFECYCLE = {
  ACTIVE: "Active",
  ACTIVE_MATURE: "Active Mature",
  DISCONTINUED: "Discontinued",
  END_OF_LIFE: "End of Life",
};
export const lifecycleLabel = (s) =>
  s ? (LIFECYCLE[s] ?? String(s).toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())) : null;
export const isDiscontinued = (s) => /discontinu|end.?of.?life|obsolete/i.test(String(s ?? ""));

/** Labels for the parts of Rockwell's comma-separated product description. */
const PART_RULES = [
  [/touch|keypad|key pad|function key|push ?button|joystick/i, "Operator Input"],
  [/ethernet|dlr|rs-?232|rs-?485|rs-?422|dh\+|dh-?485|devicenet|controlnet|profibus|profinet|modbus|usb|serial|wireless|wi-?fi|bluetooth|port/i, "Communication"],
  [/\b\d+(\.\d+)?\s*(-\s*\d+(\.\d+)?\s*)?v\s*(dc|ac)\b|\bv\s*(dc|ac)\b|\bvdc\b|\bvac\b|power supply|power input|\b(dc|ac) (power|input)\b|poe\b/i, "Power"],
  [/\b\d{3,4}\s*[x×]\s*\d{3,4}\b|\b\d+:\d+\b/i, "Resolution"],
  [/windows|win ce|wince|linux|firmware|\bos\b|iot core|ltsc/i, "Operating System"],
  [/colou?r|monochrome|\bmono\b|grayscale|greyscale|aspect|tft|lcd|led backlight|display/i, "Display"],
  [/conformal|coated|stainless|alumin(i)?um|\bip\s?\d\d\b|nema|hazardous|class i|div\.? ?2|atex|marine/i, "Environment / Housing"],
  [/\b\d+\s*(gb|mb)\b|memory|\bram\b|storage|sd card/i, "Memory"],
  [/brandless|branded|logo|allen-bradley/i, "Branding"],
  [/\bmodel\b|standard|performance|compact|edition|advanced|basic/i, "Model"],
  [/cable|cord|harness/i, "Cable"],
  [/mount|bracket|bezel|kit|adapter|protector|overlay|cover|handle/i, "Accessory Type"],
];

/** Display sizes like "12 WXGA", "6.5 in", "15\"", "10.4 inch" */
const SIZE_RE = /^(\d+(\.\d+)?)\s*(in\.?|inch(es)?|"|″|w?xga|svga|vga|qvga|wvga|hd|fhd|w)(\s|$)/i; // a unit is required ("1250 Model" isn't a size)

/**
 * Splits "2711PPanelView Plus 7 Performance Terminals, Touch Screen, 12 WXGA, …"
 * into a family phrase ("PanelView Plus 7 Performance Terminals") and labelled specs.
 */
export function parseDescription(description, bulletin) {
  let text = String(description ?? "").replace(/\s+/g, " ").trim();
  if (bulletin && text.toUpperCase().startsWith(String(bulletin).toUpperCase())) {
    const rest = text.slice(String(bulletin).length);
    if (/^\s*[A-Z]/.test(rest)) text = rest.trim(); // "2711PPanelView…" → "PanelView…"
  }
  const parts = text
    .split(/\s*[,;]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const family = parts.shift() ?? "";
  const specs = new Map();
  const add = (label, value) => specs.set(label, specs.has(label) ? `${specs.get(label)}, ${value}` : value);
  for (const part of parts) {
    if (SIZE_RE.test(part) && !/\bv\s*(dc|ac)\b|vdc|vac|\bmm\b|°|\bft\b|\bm\b|gb|mb|model/i.test(part)) {
      add("Display Size", part);
      continue;
    }
    const rule = PART_RULES.find(([re]) => re.test(part));
    add(rule ? rule[1] : "Features", part);
  }
  return { family, text, specs: [...specs].map(([label, value]) => ({ label, value })) };
}

const DOC_PRIORITY = ["TECHNICAL_DATA", "GENERAL", "PRODUCT_PROFILE", "SELECTION_GUIDE", "USER_MANUAL", "INSTALLATION_INSTRUCTIONS"];

/** Turns one product from Rockwell's feed into the format the uploader understands. */
export function buildItem(doc, series, prefix) {
  const catalog = String(doc.catalogNumber ?? "").trim();
  const { family, text, specs } = parseDescription(doc.description, doc.bulletinNumber);
  const status = lifecycleLabel(doc.productLifeCycleStatus);

  const extra = [];
  for (const f of doc.features ?? []) if (f.name && f.value) extra.push({ label: f.name, value: f.value });
  if (doc.bulletinNumber) extra.push({ label: "Bulletin", value: String(doc.bulletinNumber) });
  if (doc.series) extra.push({ label: "Series", value: String(doc.series) });
  if (status) extra.push({ label: "Lifecycle Status", value: status });
  const seen = new Set(specs.map((s) => s.label.toLowerCase()));
  for (const e of extra) if (!seen.has(e.label.toLowerCase())) (seen.add(e.label.toLowerCase()), specs.push(e));

  const descLines = [doc.title || family, text && text !== doc.title ? text : null];
  if (isDiscontinued(doc.productLifeCycleStatus))
    descLines.push("Discontinued by the manufacturer — contact us for availability, spares or a recommended replacement.");

  // PDFs: real .pdf links, plus Rockwell's generated "Product Cutsheet" (a PDF without .pdf in its address).
  const pdfs = (doc.documents ?? []).filter((d) => d.url && (/\.pdf(\?|$)/i.test(d.url) || /cutsheet/i.test(d.url)));
  pdfs.sort((a, b) => {
    const ia = DOC_PRIORITY.indexOf(a.type), ib = DOC_PRIORITY.indexOf(b.type);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const image = doc.image || series.image || null;
  return {
    source_url: `${ORIGIN}/en-us/products/details.${catalog}.html`,
    name: catalog,
    slug: slugify(catalog),
    category: `${prefix}${series.name}`,
    description: [...new Set(descLines.filter(Boolean))].join("\n"),
    specs,
    images: image ? [image] : [],
    image_is_series_photo: !doc.image && !!series.image,
    datasheet_url: pdfs[0]?.url ?? null,
    pdfs: pdfs.map((p) => ({ title: p.name || p.type, type: p.type, url: p.url })),
    lifecycle: status,
  };
}

/* --------------------------------------------------------------- the site */

/**
 * Rockwell's site turns away obviously automated browsers, so this one presents itself like
 * a normal Chrome window. Use --headed to watch it (or if the site still blocks it).
 */
async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    die("Playwright is not installed. Run: npm install -D playwright && npx playwright install chromium");
  }
  const browser = await chromium.launch({ headless: !flag("headed"), args: ["--disable-blink-features=AutomationControlled"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1366, height: 900 },
  });
  await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
  const page = await context.newPage();
  return { browser, page };
}

/** Runs inside the Rockwell page: slim copy of one feed page (keeps our JSON small). */
async function feedPage({ cats, region, start, size, discontinued }) {
  const q = new URLSearchParams({
    countryCode: region,
    app: "RA",
    categoryIds: cats,
    startIndex: String(start),
    numResults: String(size),
    fields: "all",
    sortBy: "default",
    elasticSearch: "true",
    textSearch: "",
  });
  let url = "/bin/rockwell-automation/product-details?" + q.toString();
  if (discontinued) url += "&filters=discontinued=true---"; // what the "Include Discontinued Products" switch sends
  let res, text;
  try {
    res = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(45_000) }); // the feed sometimes never answers
    text = await res.text();
  } catch (e) {
    return { ok: false, status: e.name === "TimeoutError" ? "timeout" : e.message };
  }
  if (!res.ok || !text.trim().startsWith("{")) return { ok: false, status: res.status };
  const j = JSON.parse(text);
  const abs = (u) => {
    try {
      return u ? new URL(u, location.origin).href : null;
    } catch {
      return null;
    }
  };
  return {
    ok: true,
    total: j.total ?? 0,
    docs: (j.docs ?? []).map((d) => ({
      catalogNumber: d.catalogNumber,
      title: d.title,
      description: d.description,
      bulletinNumber: d.bulletinNumber,
      series: d.series,
      productLifeCycleStatus: d.productLifeCycleStatus,
      image: abs(d.picture_url || d.image),
      features: (d.classificationFeaturesArray ?? []).map((f) => ({ name: f.translated_name_en || f.classification_name, value: f.translated_value_en || f.value })),
      documents: (d.documents ?? []).map((x) => ({ type: x.documentType, name: x.name_value, url: abs(x.url) })),
    })),
  };
}

async function gotoSettled(page, url) {
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (res && [401, 403, 429].includes(res.status()))
    throw new Error(`Rockwell's site refused the request (HTTP ${res.status()}). Wait a few minutes and try again, or add --headed.`);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function findSeries(page, familyUrl) {
  await gotoSettled(page, familyUrl);
  const base = new URL(familyUrl).pathname.replace(/^\/[a-z]{2}-[a-z]{2}/i, "").replace(/\.html$/, ""); // /products/hardware/hmi
  // Links in the page's main area (not the site menu, which lists other product families too).
  const links = await page.$$eval("a[href]", (as) => {
    const inMain = as.filter((a) => a.closest("main"));
    return (inMain.length ? inMain : as).map((a) => ({ href: a.href.split("#")[0].split("?")[0], text: a.textContent }));
  });
  const re = new RegExp(`^/[a-z]{2}-[a-z]{2}${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^/]+\\.html$`, "i");
  const found = new Map();
  for (const l of links) {
    let u;
    try {
      u = new URL(l.href);
    } catch {
      continue;
    }
    if (u.origin !== ORIGIN || !re.test(u.pathname)) continue;
    const key = u.pathname.replace(/^\/[a-z]{2}-[a-z]{2}/i, "");
    if (!found.has(key)) found.set(key, { url: u.href, slug: key.split("/").pop().replace(/\.html$/, "") });
  }
  return [...found.values()];
}

async function readSeries(page, s, { discontinued }) {
  await gotoSettled(page, s.url);
  const info = await page.evaluate(() => {
    const el = document.querySelector("[data-category-list]");
    const abs = (u) => {
      try {
        return u ? new URL(u, location.href).href : null;
      } catch {
        return null;
      }
    };
    const NOT_PRODUCT = /logo|hero|lifecycle|industrial|remote|people|interaction|factorytalk|thinman|download-center|banner|icon|teaser|background/i;
    const og = abs(document.querySelector('meta[property="og:image"]')?.getAttribute("content"));
    const hero = [...document.querySelectorAll("main img, img")]
      .map((i) => abs(i.currentSrc || i.src || i.getAttribute("data-src")))
      .find((src) => src && /scene7(\.com)?\/is\/image\//i.test(src) && !NOT_PRODUCT.test(src.split("/").pop()));
    return {
      cats: el?.getAttribute("data-category-list") || (document.documentElement.innerHTML.match(/data-category-list="([^"]*)"/) || [])[1] || null,
      title: document.querySelector("h1")?.textContent?.trim() || document.title.split("|")[0].trim(),
      image: hero || (og && !NOT_PRODUCT.test(og.split("/").pop()) ? og : null),
    };
  });
  if (!info.cats) throw new Error("couldn't find the product list on this series page");

  // Pick the region whose feed answers with the most products.
  // (asked in parallel: a region that hangs doesn't hold up the others)
  const probes = await Promise.all(
    REGIONS.map((region) => page.evaluate(feedPage, { cats: info.cats, region, start: 0, size: 1, discontinued }).then((r) => ({ region, ...r }))),
  );
  const regions = probes.filter((r) => r.ok && r.total > 0).sort((a, b) => b.total - a.total);
  if (!regions.length) {
    if (probes.some((r) => r.ok)) return { ...s, ...named(info, s), region: "-", total: 0, docs: [], missing: 0 };
    throw new Error(`Rockwell's product feed didn't answer for any region (${probes.map((r) => `${r.region}: ${r.status}`).join(", ")})`);
  }
  const total = regions[0].total;

  // Rockwell's feed often fails (HTTP 500) on big pages while small ones work, and some regions
  // fail where others don't. So: shrink the page size when a request fails, and if products are
  // still missing, fill the gaps from the next region.
  const byCatalog = new Map();
  const used = [];
  for (const { region } of regions) {
    const before = byCatalog.size;
    const got = await readRegion(page, info.cats, region, total, discontinued);
    for (const d of got.docs) if (d.catalogNumber && !byCatalog.has(d.catalogNumber)) byCatalog.set(d.catalogNumber, d);
    if (byCatalog.size > before) used.push(region);
    if (byCatalog.size >= total) break;
    log(`  … ${region}: ${got.docs.length} of ${total} (${got.failed} wouldn't load) — trying another region for the rest`);
  }
  const docs = [...byCatalog.values()];
  return { ...s, ...named(info, s), region: used.join("+") || regions[0].region, total, docs, missing: Math.max(0, total - docs.length) };
}

function named(info, s) {
  return { name: seriesName(info.title) || seriesName(s.slug.replace(/-/g, " ")), title: info.title, image: info.image };
}

/** Pages through one region, splitting a failing request into smaller ones (100 → 20 → 5 → 1). */
async function readRegion(page, cats, region, total, discontinued) {
  const SIZES = [PAGE_SIZE, 20, 5, 1];
  const docs = [];
  let failed = 0;
  let singleFailsInARow = 0;
  const get = async (start, size) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await page.evaluate(feedPage, { cats, region, start, size, discontinued });
      if (r.ok) return r;
      if (r.status === "timeout") return r; // don't wait another 45 s on the same request
      await sleep(1000 * attempt);
    }
    return { ok: false };
  };
  const fetchRange = async (start, end, level) => {
    const size = SIZES[level];
    for (let s = start; s < end; s += size) {
      if (singleFailsInARow >= 5) return; // this region is broken here, let the next region fill in
      const n = Math.min(size, end - s);
      const r = await get(s, n);
      if (r.ok) {
        docs.push(...r.docs);
        if (size === 1) singleFailsInARow = 0;
        await sleep(300);
      } else if (level < SIZES.length - 1) {
        await fetchRange(s, s + n, level + 1);
      } else {
        failed++;
        singleFailsInARow++;
      }
    }
  };
  await fetchRange(0, Math.min(total, 5000), 0);
  return { docs, failed: Math.max(0, total - docs.length) };
}

/** Downloads through the browser session (Rockwell blocks plain scripts). */
function browserDownloader(context) {
  const MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
  return async (url, maxBytes) => {
    let res;
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await context.request.get(url, { headers: { referer: `${ORIGIN}/` }, timeout: 60_000 }).catch((e) => ({ ok: () => false, status: () => e.message }));
      if (res.ok()) break;
      await sleep(1500 * attempt);
    }
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    const buf = Buffer.from(await res.body());
    if (buf.length > maxBytes) throw new Error(`file too large (${(buf.length / 1048576).toFixed(1)} MB)`);
    let type = (res.headers()["content-type"] ?? "").split(";")[0].trim();
    let ext = MIME[type];
    if (!ext) {
      ext = (url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? "").toLowerCase();
      type = Object.entries(MIME).find(([, e]) => e === ext)?.[0] ?? type;
      if (ext === "jpeg") ext = "jpg";
    }
    if (!MIME[type]) throw new Error(`unexpected file type (${type || "unknown"})`);
    return { buf, ext, type };
  };
}

/* ------------------------------------------------------------------ commands */

async function uploadWithBrowser(items, opts) {
  const { browser, page } = await launchBrowser();
  try {
    await gotoSettled(page, `${ORIGIN}/en-us.html`); // get past the site's bot check once
    await uploadItems(items, { ...opts, createCategories: true, downloader: browserDownloader(page.context()) });
  } finally {
    await browser.close();
  }
}

async function run() {
  const [familyUrl] = positional();
  if (!familyUrl || !(familyUrl.includes("rockwellautomation.com") || process.env.RW_ORIGIN)) die('Usage: node scripts/import-rockwell.mjs "<rockwellautomation.com family page>" --brand "Allen Bradley" [--publish] [--update]');
  const brand = option("brand");
  if (!brand) die('Please give --brand "Allen Bradley" (as in your admin panel).');
  const prefix = option("prefix") ?? "HMI - ";
  const discontinued = !flag("active-only");
  const only = words(option("only"));
  const skip = words(option("skip"));
  const out = option("out") ?? `imports/rockwell-${slugify(new URL(familyUrl).pathname).slice(0, 40)}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  await fs.mkdir(path.dirname(out), { recursive: true });

  const { browser, page } = await launchBrowser();
  let items = [];
  try {
    log(`\nOpening ${familyUrl}`);
    let series = await findSeries(page, familyUrl);
    if (only.length) series = series.filter((s) => only.some((w) => s.slug.toLowerCase().includes(w)));
    if (skip.length) series = series.filter((s) => !skip.some((w) => s.slug.toLowerCase().includes(w)));
    if (!series.length) die("No series pages found on that page (or none left after --only/--skip).");
    log(`Found ${series.length} series: ${series.map((s) => s.slug).join(", ")}`);
    log(discontinued ? "Including discontinued products." : "Active products only.");

    const seen = new Set();
    const summary = [];
    for (const [i, s] of series.entries()) {
      log(`\n[${i + 1}/${series.length}] ${s.url}`);
      try {
        const data = await readSeries(page, s, { discontinued });
        let added = 0, dup = 0, disc = 0, noPhoto = 0, seriesPhoto = 0, noPdf = 0;
        for (const doc of data.docs) {
          if (!doc.catalogNumber) continue;
          const key = doc.catalogNumber.toUpperCase();
          if (seen.has(key)) {
            dup++;
            continue;
          }
          seen.add(key);
          const item = buildItem(doc, data, prefix);
          items.push(item);
          added++;
          if (isDiscontinued(doc.productLifeCycleStatus)) disc++;
          if (!item.images.length) noPhoto++;
          if (item.image_is_series_photo) seriesPhoto++;
          if (!item.datasheet_url) noPdf++;
        }
        const line = `${prefix}${data.name}: ${added} products (${disc} discontinued)${dup ? `, ${dup} already in another series` : ""}${seriesPhoto ? `, ${seriesPhoto} use the series photo` : ""}${noPhoto ? `, ${noPhoto} without photo` : ""}${noPdf ? `, ${noPdf} without PDF` : ""}${data.missing ? `, ${data.missing} COULDN'T BE LOADED (run again later)` : ""}  [feed region: ${data.region}]`;
        summary.push(line);
        log(`  ${line}`);
      } catch (e) {
        summary.push(`${s.slug}: ✖ ${e.message}`);
        log(`  ✖ ${e.message}`);
      }
    }

    await fs.writeFile(out, JSON.stringify(items, null, 2) + "\n");
    log(`\n──────── Summary ────────\n${summary.join("\n")}\n\n✔ ${items.length} products saved to ${out}`);
    if (!items.length) die("Nothing to upload.");
  } finally {
    await browser.close();
  }

  if (!flag("yes")) {
    log("  You can open that file now and edit or delete products (or change a \"category\") before continuing.");
    const answer = (await ask(`\nUpload these ${items.length} products? Type "yes" to continue: `)).toLowerCase();
    if (answer !== "yes" && answer !== "y") {
      log(`\nStopped. Nothing was uploaded. To upload later:\n  node scripts/import-rockwell.mjs upload ${out} --brand "${brand}"${flag("publish") ? " --publish" : ""}${flag("update") ? " --update" : ""}\n`);
      return;
    }
    items = JSON.parse(await fs.readFile(out, "utf8")); // pick up any edits
  }
  await uploadWithBrowser(items, { brandArg: brand, dry: flag("dry-run"), publish: flag("publish"), update: flag("update") });
}

async function uploadFile() {
  const [, file] = positional();
  if (!file) die('Usage: node scripts/import-rockwell.mjs upload <file.json> --brand "Allen Bradley" [--publish] [--update] [--dry-run]');
  const brand = option("brand");
  if (!brand) die('Please give --brand "Allen Bradley".');
  const items = JSON.parse(await fs.readFile(file, "utf8"));
  if (!Array.isArray(items) || !items.length) die(`${file} has no products.`);
  await uploadWithBrowser(items, { brandArg: brand, dry: flag("dry-run"), publish: flag("publish"), update: flag("update") });
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (runDirectly) {
  if (positional()[0] === "upload") await uploadFile();
  else await run();
}
