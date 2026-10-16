import { useMemo } from "react";
import { Link } from "react-router";
import { m } from "framer-motion";
import {
  ArrowRight,
  ChevronRight,
  Clock,
  Cpu,
  Gauge,
  Headphones,
  Layers,
  Package,
  Send,
  Settings,
  TrendingUp,
  Truck,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { useBrands, useCatalog, useCategories, useIndustries, useSiteSettings, type Settings as SiteInfo } from "@/lib/queries";
import { industryIcon } from "@/lib/icons";
import { SITE_URL, useSeo, type JsonLd } from "@/hooks/use-seo";
import { SectionHeading } from "@/components/site/SectionHeading";
import { LogoTile } from "@/components/site/LogoTile";
import { AnimatedCounter } from "@/components/site/AnimatedCounter";
import { fadeUp, stagger } from "@/components/site/motion";

const FLOATING = [
  { Icon: Cpu, delay: 0, x: "10%", y: "20%" },
  { Icon: Gauge, delay: 0.5, x: "85%", y: "30%" },
  { Icon: Settings, delay: 1, x: "75%", y: "70%" },
  { Icon: Zap, delay: 1.5, x: "15%", y: "75%" },
];

/** 2 / 3 / 5 per row, centred when a row is not full. */
const TILE = "w-[calc(50%-0.5rem)] sm:w-[calc(33.333%-0.67rem)] lg:w-[calc(20%-0.8rem)]";

const STAT_ICONS = [Package, TrendingUp, Users, Clock];

const STEPS = [
  { icon: Wrench, title: "Identify Your Need", desc: "Tell us about your industrial automation requirements and challenges." },
  { icon: Package, title: "Product Selection", desc: "Our experts recommend the best products from our extensive catalog." },
  { icon: Truck, title: "Fast Delivery", desc: "We ensure timely delivery with proper packaging and documentation." },
  { icon: Headphones, title: "Ongoing Support", desc: "Post-sale technical support and assistance whenever you need." },
];

/** schema.org LocalBusiness for the home page, built from Admin → Settings. */
function organizationLd(s: SiteInfo): JsonLd {
  const lines = s.address_lines.map((l) => l.trim().replace(/,$/, "")).filter(Boolean);
  const street = lines.filter((l) => !/^pakistan$/i.test(l));
  const all = lines.join(" ");
  const postalCode = all.match(/\b\d{5}\b/)?.[0];
  const phones = [...s.phones, ...(s.mobile ? [s.mobile] : [])];
  return {
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}/#organization`,
    name: s.company_name,
    ...(s.tagline && { description: s.tagline }),
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/logo.png`,
    image: `${SITE_URL}/og-image.png`,
    ...(street.length > 0 && {
      address: {
        "@type": "PostalAddress",
        streetAddress: street.join(", ").replace(/,?\s*post\s*code:?\s*\d{5}/i, ""),
        ...(/karachi/i.test(all) && { addressLocality: "Karachi" }),
        ...(postalCode && { postalCode }),
        addressCountry: "PK",
      },
    }),
    ...(phones.length > 0 && { telephone: phones.length === 1 ? phones[0] : phones }),
    ...(s.email && { email: s.email }),
    ...(Object.keys(s.social).length > 0 && { sameAs: Object.values(s.social) }),
  };
}

function MoreLink({ to, children }: { to: string; children: string }) {
  return (
    <m.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mt-8 text-center">
      <Link to={to} className="glow-button-outline group inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold">
        {children}
        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
      </Link>
    </m.div>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-[90vh] items-center overflow-hidden">
      <div className="absolute inset-0">
        <picture>
          <source
            type="image/webp"
            srcSet="/images/hero-768.webp 768w, /images/hero-1280.webp 1280w, /images/hero-1920.webp 1920w"
            sizes="100vw"
          />
          <img
            src="/images/hero-1920.jpg"
            alt="Industrial automation equipment"
            width={1920}
            height={688}
            fetchPriority="high"
            className="h-full w-full object-cover object-center"
          />
        </picture>
        <div className="absolute inset-0 z-10 bg-black/65" />
        <div className="absolute inset-0 z-20 bg-gradient-to-r from-black/95 via-black/70 to-black/30" />
        <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
      </div>

      {FLOATING.map(({ Icon, delay, x, y }, i) => (
        <m.div
          key={i}
          aria-hidden
          className="absolute z-20 hidden h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 lg:flex"
          style={{ left: x, top: y }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.6, scale: 1 }}
          transition={{ delay: delay + 0.8, duration: 0.6 }}
        >
          <Icon className="h-6 w-6 text-primary" />
        </m.div>
      ))}

      <div className="container relative z-30 px-4">
        <div className="max-w-3xl p-2 sm:p-6 lg:p-10">
          <m.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 font-mono text-xs text-white/90">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Industrial Automation &amp; Aviation Fueling
            </span>
          </m.div>
          <m.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="mb-6 text-4xl font-black leading-[1.05] text-white drop-shadow-lg sm:text-5xl lg:text-7xl"
          >
            <span className="drop-shadow-md">Your Trusted Partner in </span>
            <span className="text-primary drop-shadow-lg">Industrial Automation</span>
          </m.h1>
          <m.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mb-8 max-w-xl text-lg font-medium leading-relaxed text-white/90 drop-shadow-md"
          >
            Matrix Automation &amp; Control supplies world-class automation products from leading brands like Siemens,
            Allen Bradley, Omron and more — powering industries across the globe.
          </m.p>
          <m.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="flex flex-wrap gap-4"
          >
            <Link
              to="/products"
              className="group inline-flex items-center gap-2 rounded-lg bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/40"
            >
              Explore by Category
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              to="/brands"
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-7 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:border-primary/50 hover:bg-white/20"
            >
              <Layers className="h-4 w-4" /> Explore by Brand
            </Link>
          </m.div>
        </div>
      </div>

      <m.div
        className="absolute bottom-0 left-0 right-0 z-30 h-1 bg-gradient-to-r from-transparent via-primary to-transparent"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 1, duration: 1.2 }}
      />
    </section>
  );
}

export default function Home() {
  const { settings } = useSiteSettings();
  useSeo({
    description:
      "Matrix Automation & Control — authorized supplier of industrial automation, instrumentation and aviation fueling products in Pakistan.",
    jsonLd: organizationLd(settings),
  });
  const brands = useBrands();
  const categories = useCategories();
  const catalog = useCatalog();
  const industries = useIndustries();

  // Only categories that actually have products, so no card leads to an empty page.
  const shownCategories = useMemo(() => {
    if (!categories.data) return [];
    const used = catalog.data ? new Set(catalog.data.map((p) => p.category_id)) : null;
    return categories.data.filter((c) => !used || used.has(c.id)).slice(0, 10);
  }, [categories.data, catalog.data]);

  // Brands with a logo first, so the section looks complete.
  const shownBrands = [...(brands.data ?? [])]
    .sort((a, b) => Number(!a.logo_url) - Number(!b.logo_url))
    .slice(0, 10);

  return (
    <>
      <Hero />

      {/* Stats */}
      {settings.stats.length > 0 && (
        <section className="relative z-20 -mt-10 py-6">
          <div className="container px-4">
            <m.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="glass-panel bg-card/95 p-6 lg:p-8"
            >
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-4 lg:gap-8">
                {settings.stats.slice(0, 4).map((s, i) => {
                  const Icon = STAT_ICONS[i] ?? Package;
                  return (
                    <m.div
                      key={s.label}
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="group text-center"
                    >
                      <m.div
                        whileHover={{ rotate: 10, scale: 1.1 }}
                        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 transition-colors group-hover:bg-primary/20"
                      >
                        <Icon className="h-6 w-6 text-primary" />
                      </m.div>
                      <p className="text-2xl font-black text-foreground lg:text-3xl">
                        <AnimatedCounter value={s.value} suffix={s.suffix} />
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                    </m.div>
                  );
                })}
              </div>
            </m.div>
          </div>
        </section>
      )}

      {/* How we work */}
      <section className="py-20">
        <div className="container px-4">
          <SectionHeading
            eyebrow="Our Process"
            title="How We"
            highlight="Work"
            description="From requirement to delivery — a seamless experience designed for engineers."
            className="mb-14"
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <m.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                className="group relative"
              >
                <div className="glass-panel-hover h-full p-8 text-center">
                  <m.div
                    whileHover={{ rotate: 5, scale: 1.05 }}
                    className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 transition-all duration-500 group-hover:border-primary group-hover:bg-primary"
                  >
                    <step.icon className="h-7 w-7 text-primary transition-colors duration-500 group-hover:text-primary-foreground" />
                  </m.div>
                  <span className="mb-2 block font-mono text-xs text-primary/60">Step {i + 1}</span>
                  <h3 className="mb-2 text-base font-bold text-foreground">{step.title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 lg:flex">
                    <ChevronRight className="h-5 w-5 text-primary/30" />
                  </div>
                )}
              </m.div>
            ))}
          </div>
        </div>
      </section>

      {/* Brands */}
      {shownBrands.length > 0 && (
        <section className="section-gradient py-20">
          <div className="container px-4">
            <SectionHeading
              eyebrow="Trusted Partners"
              title="Brands We"
              highlight="Work With"
              description="Authorized distributors of the world's most trusted industrial automation brands."
            />
            <m.div
              variants={stagger(0.08, shownBrands.length)}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-wrap justify-center gap-4"
            >
              {shownBrands.map((b) => (
                <m.div key={b.id} variants={fadeUp} whileHover={{ y: -5, scale: 1.02 }} className={TILE}>
                  <Link
                    to={`/brands/${b.slug}`}
                    className="glass-panel-hover group flex h-36 flex-col items-center justify-center gap-3 p-4 text-center sm:p-5"
                  >
                    <LogoTile name={b.name} logoUrl={b.logo_url} className="h-14 w-full max-w-[8rem]" />
                    <h3 className="text-sm font-bold leading-tight text-foreground transition-colors group-hover:text-primary">
                      {b.name}
                    </h3>
                  </Link>
                </m.div>
              ))}
            </m.div>
            <MoreLink to="/brands">View All Brands</MoreLink>
          </div>
        </section>
      )}

      {/* Categories */}
      {shownCategories.length > 0 && (
        <section className="py-20">
          <div className="container px-4">
            <SectionHeading
              eyebrow="Our Products"
              title="Product"
              highlight="Categories"
              description="Browse our complete range of industrial automation products by category."
            />
            <m.div
              variants={stagger(0.08, shownCategories.length)}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="flex flex-wrap justify-center gap-4"
            >
              {shownCategories.map((c) => (
                <m.div key={c.id} variants={fadeUp} whileHover={{ y: -5, scale: 1.02 }} className={TILE}>
                  <Link
                    to={`/products?cat=${c.slug}`}
                    className="glass-panel-hover group relative flex h-32 flex-col items-center justify-center overflow-hidden p-6 text-center"
                  >
                    {c.image_url && (
                      <div className="absolute inset-0 opacity-10 transition-opacity group-hover:opacity-20">
                        <img src={c.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      </div>
                    )}
                    <h3 className="relative z-10 text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                      {c.name}
                    </h3>
                  </Link>
                </m.div>
              ))}
            </m.div>
            <MoreLink to="/products">View All Products</MoreLink>
          </div>
        </section>
      )}

      {/* Industries */}
      {industries.data && industries.data.length > 0 && (
        <section className="section-gradient py-20">
          <div className="container px-4">
            <SectionHeading
              eyebrow="Sectors"
              title="Industries We"
              highlight="Serve"
              description="Specialized automation solutions tailored for your industry's unique challenges."
            />
            <m.div
              variants={stagger()}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {industries.data.slice(0, 6).map((ind) => {
                const Icon = industryIcon(ind.icon);
                return (
                  <m.div key={ind.id} variants={fadeUp} whileHover={{ y: -5 }}>
                    <Link to={`/industries#${ind.slug}`} className="glass-panel-hover group flex h-full items-start gap-4 p-6">
                      <m.div
                        whileHover={{ rotate: 10 }}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 transition-colors group-hover:bg-primary/20"
                      >
                        <Icon className="h-6 w-6 text-primary" />
                      </m.div>
                      <div className="min-w-0">
                        <h3 className="mb-1 text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                          {ind.name}
                        </h3>
                        {ind.description && (
                          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{ind.description}</p>
                        )}
                      </div>
                    </Link>
                  </m.div>
                );
              })}
            </m.div>
            <MoreLink to="/industries">Explore All Industries</MoreLink>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20">
        <div className="container px-4">
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8 text-center sm:p-10 lg:p-16"
          >
            {/* Two soft glows. Static radial gradients look the same as the old animated blur-3xl
                blobs but cost nothing to draw. */}
            <div
              aria-hidden
              className="absolute -right-8 -top-8 h-80 w-80 bg-[radial-gradient(closest-side,hsl(var(--primary)/0.05),transparent)] opacity-40"
            />
            <div
              aria-hidden
              className="absolute -bottom-8 -left-8 h-64 w-64 bg-[radial-gradient(closest-side,hsl(var(--primary)/0.05),transparent)] opacity-30"
            />
            <div className="relative z-10">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
                <Send className="h-7 w-7 text-primary" />
              </div>
              <h2 className="mb-4 text-3xl font-black lg:text-4xl">
                Ready to <span className="text-gradient-primary">Get Started?</span>
              </h2>
              <p className="mx-auto mb-8 max-w-xl leading-relaxed text-muted-foreground">
                Whether you need a single sensor or a complete automation system, our team is here to help. Get in touch
                for expert consultation, product recommendations, and competitive quotes.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <m.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                  <Link to="/contact" className="glow-button group inline-flex items-center gap-2 rounded-lg px-8 py-4 text-sm font-semibold">
                    Request a Quote
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </m.div>
                <m.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                  <Link
                    to="/products"
                    className="glow-button-outline inline-flex items-center gap-2 rounded-lg px-8 py-4 text-sm font-semibold"
                  >
                    <Package className="h-4 w-4" /> Browse Products
                  </Link>
                </m.div>
              </div>
            </div>
          </m.div>
        </div>
      </section>
    </>
  );
}
