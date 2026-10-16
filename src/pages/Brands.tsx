import { useMemo } from "react";
import { Link } from "react-router";
import { m } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useBrands, useCatalog } from "@/lib/queries";
import { useSeo } from "@/hooks/use-seo";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/site/SectionHeading";
import { LogoTile } from "@/components/site/LogoTile";
import { ErrorState } from "@/components/site/ErrorState";
import { stagger } from "@/components/site/motion";

const item = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4 } },
};

export default function Brands() {
  useSeo({
    title: "Brands",
    description:
      "We are authorized distributors of the world's leading industrial automation brands — Moore Industries, Siemens, Pilz, Omron, Endress+Hauser and more.",
  });
  const brands = useBrands();
  const catalog = useCatalog();

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of catalog.data ?? []) m.set(p.brand_id, (m.get(p.brand_id) ?? 0) + 1);
    return m;
  }, [catalog.data]);

  const sorted = useMemo(
    () => [...(brands.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [brands.data],
  );

  return (
    <section className="min-h-screen py-16">
      <div className="container px-4">
        <SectionHeading
          as="h1"
          align="left"
          title="Brands We"
          highlight="Work With"
          description="We are authorized distributors of the world's leading industrial automation brands."
        />

        {brands.isError ? (
          <ErrorState message="We couldn't load the brands." onRetry={() => void brands.refetch()} />
        ) : brands.isPending ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
        ) : (
          <m.div
            variants={stagger(0.08, sorted.length)}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
          >
            {sorted.map((b) => {
              const n = counts.get(b.id) ?? 0;
              return (
                <m.div key={b.id} variants={item} whileHover={{ y: -5, scale: 1.02 }}>
                  <Link to={`/brands/${b.slug}`} className="glass-panel-hover group flex items-center gap-4 p-5 sm:p-6">
                    <LogoTile name={b.name} logoUrl={b.logo_url} className="h-14 w-24 sm:w-28" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-bold text-foreground transition-colors group-hover:text-primary sm:text-lg">
                        {b.name}
                      </h2>
                      {catalog.data && (
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {n > 0 ? `${n} product${n === 1 ? "" : "s"}` : "Available on request"}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" />
                  </Link>
                </m.div>
              );
            })}
          </m.div>
        )}
      </div>
    </section>
  );
}
