import { Link } from "react-router";
import { m } from "framer-motion";
import {
  ArrowRight,
  Award,
  ChevronRight,
  CircleCheckBig,
  Eye,
  Globe,
  Headphones,
  Package,
  Shield,
  Target,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { useSeo } from "@/hooks/use-seo";
import { SectionHeading } from "@/components/site/SectionHeading";
import { fadeUp, stagger } from "@/components/site/motion";

const HIGHLIGHTS = ["Authorized Distributor", "Technical Expertise", "Fast Delivery", "After-Sales Support"];

const PILLARS = [
  { icon: Shield, title: "Authorized Distributor", desc: "Genuine products from world-leading automation brands" },
  { icon: Globe, title: "Global Reach", desc: "Serving industries across multiple countries worldwide" },
  { icon: Headphones, title: "Expert Support", desc: "Dedicated technical support team available 24/7" },
  { icon: Award, title: "Quality Assured", desc: "ISO certified with comprehensive warranty coverage" },
];

const VALUES = [
  {
    icon: Target,
    title: "Our Mission",
    desc: "To make world-class automation technology accessible, affordable and dependable for every industry we serve.",
  },
  {
    icon: Eye,
    title: "Our Vision",
    desc: "To be the most trusted automation and instrumentation partner in the region, known for engineering integrity.",
  },
  {
    icon: Users,
    title: "Our Team",
    desc: "A team of dedicated engineers with deep field experience across oil & gas, textile, pharma and power.",
  },
];

const STEPS = [
  { icon: Wrench, title: "Identify Your Need", desc: "Tell us about your industrial automation requirements and challenges." },
  { icon: Package, title: "Product Selection", desc: "Our experts recommend the best products from our extensive catalog." },
  { icon: Truck, title: "Fast Delivery", desc: "We ensure timely delivery with proper packaging and documentation." },
  { icon: Headphones, title: "Ongoing Support", desc: "Post-sale technical support and assistance whenever you need." },
];

export default function WhoWeAre() {
  useSeo({
    title: "Who We Are",
    description:
      "Matrix Automation & Control is a leading supplier of industrial automation, instrumentation and aviation fueling products in Pakistan.",
  });

  return (
    <section className="py-12 sm:py-16">
      <div className="container px-4">
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 max-w-3xl sm:mb-14">
          <span className="eyebrow">Who We Are</span>
          <h1 className="mb-4 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
            About <span className="text-gradient-primary">Matrix Automation &amp; Control</span>
          </h1>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Matrix Automation &amp; Control is a leading supplier of industrial automation, instrumentation, and aviation
            fueling products. We partner with top global brands to deliver reliable, high-performance solutions for
            industries including oil &amp; gas, textile, pharmaceuticals, and more.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Our mission is to make world-class technology accessible and dependable. With over 15 years of experience and a
            team of dedicated engineers, we provide not just products, but complete solutions — from initial consultation to
            after-sales support.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {HIGHLIGHTS.map((h) => (
              <div key={h} className="flex items-center gap-2 text-sm text-foreground">
                <CircleCheckBig className="h-4 w-4 shrink-0 text-primary" />
                {h}
              </div>
            ))}
          </div>
        </m.div>

        <m.div
          variants={stagger()}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {PILLARS.map((p) => (
            <m.div key={p.title} variants={fadeUp} className="glass-panel-hover group p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 transition-colors group-hover:bg-primary/20">
                <p.icon className="h-6 w-6 text-primary" />
              </div>
              <h2 className="mb-1 text-sm font-bold text-foreground">{p.title}</h2>
              <p className="text-xs text-muted-foreground">{p.desc}</p>
            </m.div>
          ))}
        </m.div>

        <m.div
          variants={stagger()}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3"
        >
          {VALUES.map((v) => (
            <m.div key={v.title} variants={fadeUp} className="glass-panel-hover p-6 sm:p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                <v.icon className="h-6 w-6 text-primary" />
              </div>
              <h2 className="mb-2 text-lg font-bold">{v.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{v.desc}</p>
            </m.div>
          ))}
        </m.div>

        {/* How we work */}
        <div className="mt-16 sm:mt-20">
          <SectionHeading
            eyebrow="Our Process"
            title="How We"
            highlight="Work"
            align="left"
            description="From requirement to delivery — a seamless experience designed for engineers."
          />
          <m.div
            variants={stagger(0.12)}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            {STEPS.map((step, i) => (
              <m.div key={step.title} variants={fadeUp} className="group relative">
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
          </m.div>
        </div>

        <div className="mt-12 text-center">
          <Link to="/contact" className="glow-button inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-sm font-semibold sm:px-8">
            Talk to Our Team <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
