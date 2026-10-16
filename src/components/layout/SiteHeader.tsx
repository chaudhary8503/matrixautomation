import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { AnimatePresence, m } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeaderSearch } from "./HeaderSearch";
import { NAV_ITEMS, isActivePath } from "./nav";

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);

  const linkClass = (path: string, mobile = false) =>
    cn(
      "rounded-lg text-sm font-medium transition-all duration-300",
      mobile ? "block px-4 py-3" : "px-4 py-2",
      isActivePath(path, pathname)
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
    );

  return (
    <header className="nav-glass fixed left-0 right-0 top-0 z-50">
      <div className="container px-4">
        <div className="flex h-16 items-center justify-between lg:h-20">
          <Link to="/" className="flex items-center gap-2" aria-label="Matrix Automation & Control — home">
            <m.picture whileHover={{ scale: 1.05 }} transition={{ duration: 0.3 }} className="block">
              <source srcSet="/logo.webp" type="image/webp" />
              <img
                src="/logo.png"
                alt="Matrix Automation & Control"
                width={720}
                height={204}
                className="h-9 w-auto sm:h-10 lg:h-12"
              />
            </m.picture>
          </Link>

          <nav className="hidden items-center gap-1 xl:flex" aria-label="Main">
            {NAV_ITEMS.map((item) => (
              <Link key={item.path} to={item.path} className={linkClass(item.path)}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <HeaderSearch />
            <Link to="/contact" className="glow-button hidden rounded-lg px-5 py-2.5 text-sm xl:inline-flex">
              Get a Quote
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              className="p-2 text-muted-foreground transition-colors hover:text-foreground xl:hidden"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden border-t border-border/40 bg-background xl:hidden"
          >
            <nav className="container space-y-1 px-4 pb-6 pt-4" aria-label="Mobile">
              {NAV_ITEMS.map((item) => (
                <Link key={item.path} to={item.path} className={linkClass(item.path, true)}>
                  {item.label}
                </Link>
              ))}
              <Link to="/contact" className="glow-button mt-3 block rounded-lg px-4 py-3 text-center text-sm">
                Get a Quote
              </Link>
            </nav>
          </m.div>
        )}
      </AnimatePresence>
    </header>
  );
}
