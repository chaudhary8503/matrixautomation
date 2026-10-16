import { Link } from "react-router";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { useSiteSettings } from "@/lib/queries";
import { telHref, whatsappHref } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

const FOOTER_INDUSTRIES = ["Oil & Gas", "Textile", "Pharmaceuticals", "Power Generation"];

export function SiteFooter() {
  const { settings } = useSiteSettings();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/40 bg-card/30">
      <div className="container px-4 py-12 sm:py-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-10">
          <div>
            <Link to="/" className="mb-4 flex items-center gap-2">
              <img src="/logo.png" alt={settings.company_name} width={720} height={204} className="h-10 w-auto sm:h-12" />
            </Link>
            <p className="mb-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Your trusted partner for industrial automation, instrumentation &amp; aviation fueling solutions.
              Delivering quality products from world-leading brands.
            </p>
            <address className="space-y-3 text-sm not-italic text-muted-foreground">
              {settings.address_lines.length > 0 && (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="leading-relaxed">
                    {settings.address_lines.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {settings.phones.length > 0 && (
                <div className="flex items-start gap-2">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="leading-relaxed">
                    {settings.phones.map((p) => (
                      <a key={p} href={telHref(p)} className="block transition-colors hover:text-primary">
                        {p}
                      </a>
                    ))}
                  </span>
                </div>
              )}
              {settings.mobile && (
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 shrink-0 text-primary" />
                  <a
                    href={settings.whatsapp ? whatsappHref(settings.whatsapp) : telHref(settings.mobile)}
                    target={settings.whatsapp ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="break-all transition-colors hover:text-primary"
                  >
                    {settings.mobile}
                  </a>
                </div>
              )}
              {settings.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-primary" />
                  <a href={`mailto:${settings.email}`} className="break-all transition-colors hover:text-primary">
                    {settings.email}
                  </a>
                </div>
              )}
            </address>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-foreground">Quick Links</h4>
            <ul className="space-y-2.5">
              {NAV_ITEMS.map((item) => (
                <li key={item.path}>
                  <Link to={item.path} className="text-sm text-muted-foreground transition-colors duration-200 hover:text-primary">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-foreground">Industries</h4>
            <ul className="space-y-2.5">
              {FOOTER_INDUSTRIES.map((name) => (
                <li key={name}>
                  <Link to="/industries" className="text-sm text-muted-foreground transition-colors duration-200 hover:text-primary">
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border/30 pt-8 sm:mt-12">
          {Object.keys(settings.social).length > 0 && (
            <div className="mb-4 flex flex-wrap justify-center gap-4 text-xs">
              {Object.entries(settings.social).map(([network, url]) => (
                <a key={network} href={url} target="_blank" rel="noopener noreferrer" className="capitalize text-muted-foreground transition-colors hover:text-primary">
                  {network === "linkedin" ? "LinkedIn" : network === "youtube" ? "YouTube" : network}
                </a>
              ))}
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground">
            © {year} {settings.company_name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
