import { useId, useState, type FormEvent } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { useSiteSettings, useSubmitInquiry } from "@/lib/queries";
import { cn, whatsappHref } from "@/lib/utils";

const FIELD =
  "w-full rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/10";
const LABEL = "mb-2 block text-xs font-medium text-muted-foreground";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  source: "contact" | "product";
  product?: { id: string; name: string };
  compact?: boolean;
  className?: string;
};

/** Contact / quote form. Saves to the `inquiries` table (Admin → Inquiries). */
export function InquiryForm({ source, product, compact, className }: Props) {
  const id = useId();
  const { settings } = useSiteSettings();
  const submit = useSubmitInquiry();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: product ? `Please send me a quote for ${product.name}.` : "",
    website: "", // honeypot — real people never see or fill this
  });

  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = values.name.trim();
    const email = values.email.trim();
    const phone = values.phone.trim();
    const message = values.message.trim();

    if (values.website) return setSent(true); // bot: pretend it worked
    if (!email && !phone) return setError("Please give us an email address or a phone number so we can reply.");
    if (email && !EMAIL_RE.test(email)) return setError("That email address doesn't look right.");

    try {
      await submit.mutateAsync({
        name,
        email: email || null,
        phone: phone || null,
        company: values.company.trim() || null,
        message: message || null,
        source,
        product_id: product?.id ?? null,
        product_name: product?.name ?? null,
      });
      setSent(true);
    } catch (err) {
      console.error(err);
      // Raised by the spam-guard trigger (supabase/migrations/002_inquiry_spam_guard.sql).
      const { code, message: msg = "" } = (err ?? {}) as { code?: string; message?: string };
      if (code === "PT429" || msg.includes("inquiry_rate_limited")) {
        return setError(
          `Too many messages right now, please try again in a few minutes${settings.whatsapp ? " or WhatsApp us" : ""}.`,
        );
      }
      if (code === "PT409" || msg.includes("inquiry_duplicate")) {
        toast.info("We already have this message.", { description: "No need to send it again — our team will be in touch." });
        return setSent(true);
      }
      toast.error("Sorry, your message could not be sent.", {
        description: settings.email ? `Please email us at ${settings.email} or try again.` : "Please try again.",
      });
    }
  };

  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        {sent ? (
          <m.div
            key="sent"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn("text-center", compact ? "py-8" : "py-16")}
            role="status"
          >
            <m.div
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-primary/20"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <Send className="h-8 w-8 text-primary" />
            </m.div>
            <h3 className="mb-2 text-xl font-bold text-foreground">{product ? "Quote Request Sent" : "Message Sent"}</h3>
            <p className="text-sm text-muted-foreground">Thank you — our team will respond within 24 hours.</p>
          </m.div>
        ) : (
          <m.form key="form" exit={{ opacity: 0 }} onSubmit={onSubmit} className="space-y-4" noValidate={false}>
            <div className={cn("grid gap-4", !compact && "sm:grid-cols-2")}>
              <div>
                <label htmlFor={`${id}-name`} className={LABEL}>
                  Name *
                </label>
                <input id={`${id}-name`} required maxLength={200} autoComplete="name" value={values.name} onChange={set("name")} className={FIELD} placeholder="Your name" />
              </div>
              <div>
                <label htmlFor={`${id}-company`} className={LABEL}>
                  Company
                </label>
                <input id={`${id}-company`} maxLength={200} autoComplete="organization" value={values.company} onChange={set("company")} className={FIELD} placeholder="Company name" />
              </div>
              <div>
                <label htmlFor={`${id}-email`} className={LABEL}>
                  Email
                </label>
                <input id={`${id}-email`} type="email" maxLength={320} autoComplete="email" value={values.email} onChange={set("email")} className={FIELD} placeholder="you@company.com" />
              </div>
              <div>
                <label htmlFor={`${id}-phone`} className={LABEL}>
                  Phone / WhatsApp
                </label>
                <input id={`${id}-phone`} type="tel" maxLength={50} autoComplete="tel" value={values.phone} onChange={set("phone")} className={FIELD} placeholder="+92 3xx xxxxxxx" />
              </div>
            </div>
            <div>
              <label htmlFor={`${id}-message`} className={LABEL}>
                Message *
              </label>
              <textarea
                id={`${id}-message`}
                required
                maxLength={5000}
                rows={compact ? 4 : 5}
                value={values.message}
                onChange={set("message")}
                className={cn(FIELD, "resize-none")}
                placeholder="Tell us the part numbers, quantities or your application."
              />
            </div>
            {/* Honeypot: hidden from people, irresistible to spam bots */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor={`${id}-website`}>Website</label>
              <input id={`${id}-website`} tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
            </div>

            <p className="text-[11px] text-muted-foreground">* Required. Please give an email or a phone number.</p>
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <m.button
              type="submit"
              disabled={submit.isPending}
              className="glow-button inline-flex w-full items-center justify-center gap-2 rounded-lg px-8 py-3.5 text-sm font-semibold disabled:opacity-70"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {submit.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  {product ? "Request a Quote" : "Send Message"} <Send className="h-4 w-4" />
                </>
              )}
            </m.button>

            {settings.whatsapp && (
              <a
                href={whatsappHref(
                  settings.whatsapp,
                  product ? `Hello, I'd like a quote for ${product.name}.` : "Hello Matrix Automation & Control, ",
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Prefer WhatsApp? Message us directly
              </a>
            )}
          </m.form>
        )}
      </AnimatePresence>
    </div>
  );
}
