import { m } from "framer-motion";
import { Mail, MapPin, MessageCircle, Navigation, Phone, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useSiteSettings } from "@/lib/queries";
import { telHref, whatsappHref } from "@/lib/utils";
import { useSeo } from "@/hooks/use-seo";
import { SectionHeading } from "@/components/site/SectionHeading";
import { InquiryForm } from "@/components/site/InquiryForm";

function InfoCard({ icon: Icon, label, children, index }: { icon: LucideIcon; label: string; children: ReactNode; index: number }) {
  return (
    <m.div
      className="glass-panel p-4 sm:p-5"
      whileHover={{ y: -3 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.1 }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="break-words text-sm font-medium leading-relaxed text-foreground">{children}</div>
        </div>
      </div>
    </m.div>
  );
}

export default function Contact() {
  useSeo({
    title: "Contact Us",
    description: "Get in touch with Matrix Automation & Control for inquiries, quotes, or support. Office in DHA Phase-7, Karachi.",
  });
  const { settings } = useSiteSettings();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${settings.company_name}, ${settings.address_lines.join(" ")}`,
  )}`;

  let i = 0;
  return (
    <section className="min-h-screen py-16">
      <div className="container max-w-5xl px-4">
        <SectionHeading
          as="h1"
          align="left"
          title="Contact"
          highlight="Us"
          description="Get in touch with our team for inquiries, quotes, or support."
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <m.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-6 sm:p-8 lg:col-span-2"
          >
            <InquiryForm source="contact" />
          </m.div>

          <div className="space-y-4">
            {settings.address_lines.length > 0 && (
              <InfoCard icon={MapPin} label="Address" index={i++}>
                {settings.address_lines.join(" ")}
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1 text-xs font-normal text-primary hover:underline"
                >
                  <Navigation className="h-3 w-3" /> Open in Google Maps
                </a>
              </InfoCard>
            )}
            {settings.phones.length > 0 && (
              <InfoCard icon={Phone} label="Telephone" index={i++}>
                {settings.phones.map((p) => (
                  <a key={p} href={telHref(p)} className="block hover:text-primary">
                    {p}
                  </a>
                ))}
              </InfoCard>
            )}
            {settings.mobile && (
              <InfoCard icon={MessageCircle} label="Mobile / WhatsApp" index={i++}>
                <a
                  href={settings.whatsapp ? whatsappHref(settings.whatsapp) : telHref(settings.mobile)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  {settings.mobile}
                </a>
              </InfoCard>
            )}
            {settings.email && (
              <InfoCard icon={Mail} label="Email" index={i++}>
                <a href={`mailto:${settings.email}`} className="hover:text-primary">
                  {settings.email}
                </a>
              </InfoCard>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
