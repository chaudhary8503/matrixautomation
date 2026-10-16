import { useEffect } from "react";
import { useLocation } from "react-router";
import { m } from "framer-motion";
import { CircleCheck } from "lucide-react";
import { useIndustries } from "@/lib/queries";
import { industryIcon } from "@/lib/icons";
import { useSeo } from "@/hooks/use-seo";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/site/SectionHeading";
import { LogoTile } from "@/components/site/LogoTile";
import { ErrorState } from "@/components/site/ErrorState";
import { fadeUp, stagger } from "@/components/site/motion";

export default function Industries() {
  useSeo({
    title: "Industries",
    description:
      "Automation and instrumentation solutions for oil & gas, textile, pharmaceuticals, power generation, chemical processing and water treatment.",
  });
  const { data, isPending, isError, refetch } = useIndustries();
  const { hash } = useLocation();

  // Links like /industries#oil-gas jump to that industry once it has loaded.
  useEffect(() => {
    if (!data || !hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, [data, hash]);

  return (
    <section className="min-h-screen py-12 sm:py-16">
      <div className="container px-4">
        <SectionHeading
          as="h1"
          align="left"
          title="Industries We"
          highlight="Serve"
          description="Specialized automation solutions for the unique challenges of each industry."
          className="sm:mb-14"
        />

        {isError ? (
          <ErrorState message="We couldn't load the industries." onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="space-y-5">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : (
          <m.div variants={stagger(0.1, data.length)} initial="hidden" animate="visible" className="space-y-5">
            {data.map((ind) => {
              const Icon = industryIcon(ind.icon);
              return (
                <m.article
                  key={ind.id}
                  id={ind.slug}
                  variants={fadeUp}
                  className="glass-panel-hover scroll-mt-28 p-5 sm:p-8 lg:p-10"
                >
                  <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
                    <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-5">
                      <m.div
                        whileHover={{ rotate: 10, scale: 1.1 }}
                        transition={{ duration: 0.3 }}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 sm:h-14 sm:w-14"
                      >
                        <Icon className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
                      </m.div>
                      <div className="min-w-0">
                        <h2 className="mb-2 text-lg font-bold text-foreground sm:text-xl">{ind.name}</h2>
                        {ind.description && (
                          <p className="text-sm leading-relaxed text-muted-foreground">{ind.description}</p>
                        )}
                      </div>
                    </div>
                    {ind.features.length > 0 && (
                      <div className="shrink-0 lg:w-72">
                        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                          {ind.features.map((f) => (
                            <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <CircleCheck className="h-3.5 w-3.5 shrink-0 text-primary" /> {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {ind.clients.length > 0 && (
                    <div className="mt-6 border-t border-border/60 pt-5">
                      <p className="mb-3 text-xs font-medium text-muted-foreground">In this sector we have worked with:</p>
                      <div className="flex flex-wrap items-center gap-3">
                        {ind.clients.map((c) => {
                          const inner = (
                            <>
                              <LogoTile name={c.name} logoUrl={c.logo_url} className="h-9 w-16 sm:w-20" />
                              <span className="text-xs font-semibold text-foreground sm:text-sm">{c.name}</span>
                            </>
                          );
                          return c.website_url ? (
                            <a
                              key={c.id}
                              href={c.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 rounded-lg border border-border bg-card/50 pr-3 transition-colors hover:border-primary/40"
                            >
                              {inner}
                            </a>
                          ) : (
                            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/50 pr-3">
                              {inner}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </m.article>
              );
            })}
          </m.div>
        )}
      </div>
    </section>
  );
}
