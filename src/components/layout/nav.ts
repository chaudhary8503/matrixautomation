export const NAV_ITEMS = [
  { label: "Home", path: "/" },
  { label: "Who We Are", path: "/who-we-are" },
  { label: "Products", path: "/products" },
  { label: "Brands", path: "/brands" },
  { label: "Industries", path: "/industries" },
  { label: "Contact Us", path: "/contact" },
] as const;

/** Nav item is active on its own page and on its detail pages (/products/x). */
export function isActivePath(itemPath: string, pathname: string) {
  if (itemPath === "/") return pathname === "/";
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
