import { m } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useSiteSettings } from "@/lib/queries";
import { whatsappHref } from "@/lib/utils";

/** Floating "chat on WhatsApp" button, bottom-right. Hidden if no number is set. */
export function WhatsAppButton() {
  const { settings } = useSiteSettings();
  if (!settings.whatsapp) return null;

  return (
    <m.a
      href={whatsappHref(settings.whatsapp, "Hello Matrix Automation & Control, I'd like to ask about ")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1, type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
    >
      <MessageCircle className="h-7 w-7" />
    </m.a>
  );
}
