import { lazyPage } from "@/lib/lazy-page";

// Pages other than Home load on demand, so the home page downloads less. Each can be preloaded
// (link hover, idle time, snapshot boot) so the first click never waits for a download.
export const WhoWeAre = lazyPage(() => import("@/pages/WhoWeAre"));
export const Products = lazyPage(() => import("@/pages/Products"));
export const ProductDetail = lazyPage(() => import("@/pages/ProductDetail"));
export const Brands = lazyPage(() => import("@/pages/Brands"));
export const BrandDetail = lazyPage(() => import("@/pages/BrandDetail"));
export const Industries = lazyPage(() => import("@/pages/Industries"));
export const Contact = lazyPage(() => import("@/pages/Contact"));
// Never preloaded: the admin code is only downloaded when someone opens /admin.
export const AdminApp = lazyPage(() => import("@/admin/AdminApp"));

const PUBLIC_PAGES = [WhoWeAre, Products, ProductDetail, Brands, BrandDetail, Industries, Contact];

/** Downloads the code for the public page at `pathname` (Home is already in the main bundle). */
export function preloadRoute(pathname: string): Promise<void> {
  const [, section, slug] = pathname.replace(/\/+$/, "").split("/");
  switch (section) {
    case "who-we-are":
      return WhoWeAre.preload();
    case "products":
      return slug ? ProductDetail.preload() : Products.preload();
    case "brands":
      return slug ? BrandDetail.preload() : Brands.preload();
    case "industries":
      return Industries.preload();
    case "contact":
      return Contact.preload();
    default:
      return Promise.resolve();
  }
}

export const preloadPublicPages = () => Promise.all(PUBLIC_PAGES.map((p) => p.preload())).then(() => {});
