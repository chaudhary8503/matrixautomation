import { useEffect } from "react";
import { useLocation } from "react-router";

export const SITE_URL = "https://matrixpakistan.com";
export const SITE_NAME = "Matrix Automation & Control";
const DEFAULT_TITLE = `${SITE_NAME} | Industrial Automation & Aviation Fueling`;
const DEFAULT_DESCRIPTION =
  "Matrix Automation & Control — your trusted partner for industrial automation, instrumentation and aviation fueling solutions in Pakistan.";
const DEFAULT_IMAGE = "/og-image.png";

export type JsonLd = Record<string, unknown>;

export type Seo = {
  /** Page name; rendered as "<title> | Matrix Automation & Control". Omit for the home page. */
  title?: string;
  description?: string | null;
  /** og/twitter image — absolute or site-relative. Defaults to /og-image.png. */
  image?: string | null;
  type?: "website" | "product";
  /** Canonical path, if it differs from the current pathname (e.g. old /products/<uuid> links). */
  path?: string;
  /** Keep the page out of search engines (404, admin). */
  noindex?: boolean;
  /** Structured data, written to <script type="application/ld+json" id="ld-json">. */
  jsonLd?: JsonLd | JsonLd[] | null;
};

/** Absolute URL on the live site ("/logo.png" -> "https://matrixpakistan.com/logo.png"). */
export const absoluteUrl = (pathOrUrl: string) =>
  /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

/** schema.org BreadcrumbList from [name, path] pairs. */
export function breadcrumbs(items: [name: string, path: string][]): JsonLd {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: absoluteUrl(path),
    })),
  };
}

/** Updates (or creates, if missing) one <meta>. Prerendered pages already contain them, so never duplicate. */
export function setMeta(attr: "name" | "property", key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) return el?.remove();
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (href === null) return el?.remove();
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

function setJsonLd(data: Seo["jsonLd"]) {
  let el = document.getElementById("ld-json");
  if (!data) return el?.remove();
  if (!el) {
    el = document.createElement("script");
    el.id = "ld-json";
    el.setAttribute("type", "application/ld+json");
    document.head.appendChild(el);
  }
  const doc = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data }
    : { "@context": "https://schema.org", ...data };
  // Escape "<" so text like "</script>" in a description can't end the tag in prerendered HTML.
  el.textContent = JSON.stringify(doc).replace(/</g, "\\u003c");
}

/** One line, max ~200 characters — search engines cut longer descriptions anyway. */
function clip(text: string, max = 200) {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : s;
}

function apply(seo: Seo, pathname: string) {
  const title = seo.title ? `${seo.title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const description = clip(seo.description?.trim() || DEFAULT_DESCRIPTION);
  const path = (seo.path ?? pathname).replace(/(.)\/+$/, "$1");
  const url = `${SITE_URL}${path}`;
  // Facebook, X and WhatsApp don't show SVG previews.
  const image = absoluteUrl(seo.image && !/\.svg(\?|$)/i.test(seo.image) ? seo.image : DEFAULT_IMAGE);

  document.title = title;
  setMeta("name", "description", description);
  setMeta("name", "robots", seo.noindex ? "noindex, nofollow" : null);
  setCanonical(seo.noindex ? null : url);

  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", url);
  setMeta("property", "og:image", image);
  setMeta("property", "og:type", seo.type ?? "website");
  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  setMeta("name", "twitter:image", image);

  setJsonLd(seo.noindex ? null : seo.jsonLd);
}

/**
 * Sets <title>, description, canonical, Open Graph / Twitter tags, robots and JSON-LD for the page.
 * Pass `null` while the page's data is still loading: the head is left as it is (on a prerendered
 * page it already holds the right tags), and filled in once the data arrives.
 */
export function useSeo(seo: Seo | null) {
  const { pathname } = useLocation();
  const key = seo ? JSON.stringify(seo) : null;
  useEffect(() => {
    if (key !== null) apply(JSON.parse(key) as Seo, pathname);
  }, [key, pathname]);
}
