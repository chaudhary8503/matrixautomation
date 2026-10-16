// inquiry-alert — emails sales@ when a new inquiry is saved.
//
// Called by a Supabase Database Webhook on INSERT into public.inquiries. Deployed with JWT
// verification OFF, so every request must carry the shared secret in "x-webhook-secret".
// Setup: see README.md in this folder.

import nodemailer from "npm:nodemailer@6.10.1";

type Inquiry = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
  product_id: string | null;
  product_name: string | null;
  source: string;
  page_url: string | null;
  created_at: string;
};

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Inquiry | null;
  old_record: Inquiry | null;
};

const env = (key: string, fallback?: string) => {
  const v = Deno.env.get(key)?.trim();
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing env var ${key}`);
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Constant-time string compare: hash both sides so lengths match, then XOR every byte. */
async function safeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Nothing user-supplied may smuggle a line break into an email header. */
const headerSafe = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** Digits for wa.me: "0300-1234567" -> "923001234567", "0092 300…" -> "92300…". */
function whatsappDigits(phone: string) {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^03\d{9}$/.test(d)) d = `92${d.slice(1)}`;
  return d;
}

function karachiTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(Number.isNaN(d.getTime()) ? new Date() : d);
}

function buildEmail(q: Inquiry, siteUrl: string) {
  const subject = headerSafe(
    q.product_name
      ? `New quote request: ${q.product_name}`
      : `New inquiry from ${q.name}${q.company ? ` (${q.company})` : ""}`,
  ).slice(0, 200);

  const adminUrl = `${siteUrl.replace(/\/+$/, "")}/admin/inquiries?open=${encodeURIComponent(q.id)}`;
  const time = karachiTime(q.created_at);
  const wa = q.phone ? whatsappDigits(q.phone) : "";
  const tel = q.phone ? q.phone.replace(/[^\d+]/g, "") : "";

  // ---- plain text
  const text = [
    q.product_name ? `New quote request: ${q.product_name}` : "New inquiry from the website",
    "",
    `Name:    ${q.name}`,
    q.company ? `Company: ${q.company}` : null,
    q.email ? `Email:   ${q.email}` : null,
    q.phone ? `Phone:   ${q.phone}${wa ? `  (WhatsApp: https://wa.me/${wa})` : ""}` : null,
    q.product_name ? `Product: ${q.product_name}` : null,
    "",
    "Message:",
    q.message || "(no message)",
    "",
    q.page_url ? `Page:    ${q.page_url}` : null,
    `Source:  ${q.source}`,
    `Time:    ${time} (Karachi)`,
    "",
    `Open in admin: ${adminUrl}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  // ---- HTML (every user-supplied value escaped)
  const e = escapeHtml;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${label}</td>` +
    `<td style="padding:6px 0;color:#111827">${value}</td></tr>`;
  const link = (href: string, label: string) => `<a href="${e(href)}" style="color:#dc2626">${e(label)}</a>`;

  const rows = [
    row("Name", e(q.name)),
    q.company && row("Company", e(q.company)),
    q.email && row("Email", link(`mailto:${q.email}`, q.email)),
    q.phone &&
      row(
        "Phone",
        `${tel ? link(`tel:${tel}`, q.phone) : e(q.phone)}${wa ? ` &nbsp;·&nbsp; ${link(`https://wa.me/${wa}`, "WhatsApp")}` : ""}`,
      ),
    q.product_name && row("Product", `<strong>${e(q.product_name)}</strong>`),
  ]
    .filter(Boolean)
    .join("");

  const message = q.message ? e(q.message).replace(/\r?\n/g, "<br>") : '<em style="color:#6b7280">(no message)</em>';

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#dc2626;color:#ffffff;padding:16px 24px;font-size:16px;font-weight:bold">
    ${q.product_name ? `New quote request: ${e(q.product_name)}` : "New inquiry from the website"}
  </div>
  <div style="padding:20px 24px">
    <table style="border-collapse:collapse;font-size:14px">${rows}</table>
    <div style="margin:16px 0 4px;color:#6b7280">Message</div>
    <div style="padding:12px 16px;background:#f9fafb;border-left:3px solid #dc2626;color:#111827">${message}</div>
    <p style="margin:24px 0">
      <a href="${e(adminUrl)}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold">Open in admin panel</a>
    </p>
    <p style="margin:0;color:#9ca3af;font-size:12px">
      ${e(time)} (Karachi) · source: ${e(q.source)}${q.page_url ? ` · ${link(q.page_url, q.page_url)}` : ""}
    </p>
  </div>
</div>
</body></html>`;

  return { subject, text, html };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const secret = Deno.env.get("WEBHOOK_SECRET") ?? "";
  if (!secret || !(await safeEqual(req.headers.get("x-webhook-secret") ?? "", secret))) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }
  if (payload?.type !== "INSERT" || payload.table !== "inquiries" || !payload.record) {
    return json(400, { ok: false, error: "Expected an INSERT on inquiries" });
  }

  try {
    // Google Workspace (Gmail) SMTP with an app password. Implicit TLS on 465 —
    // Supabase Edge Functions block outbound 25 and 587.
    const port = Number(env("SMTP_PORT", "465"));
    const user = env("SMTP_USER", "sales@matrixpakistan.com");
    const transporter = nodemailer.createTransport({
      host: env("SMTP_HOST", "smtp.gmail.com"),
      port,
      secure: port === 465,
      auth: { user, pass: env("SMTP_PASS") },
    });

    const q = payload.record;
    const { subject, text, html } = buildEmail(q, env("SITE_URL", "https://matrixpakistan.com"));
    const replyTo = q.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.email.trim()) ? headerSafe(q.email) : undefined;

    await transporter.sendMail({
      from: { name: "Matrix Website", address: user },
      to: env("ALERT_TO", "sales@matrixpakistan.com"),
      replyTo: replyTo ? { name: headerSafe(q.name).slice(0, 100), address: replyTo } : undefined,
      subject,
      text,
      html,
    });

    return json(200, { ok: true });
  } catch (err) {
    console.error("inquiry-alert: sending failed", err);
    return json(500, { ok: false, error: "Email could not be sent" });
  }
});
