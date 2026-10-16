# inquiry-alert: email alert for new inquiries

When someone sends the contact form or a "Request a Quote" form, a row is added to
`public.inquiries`. A **Database Webhook** then calls this Edge Function, which emails the
inquiry to sales@ through **Google Workspace (Gmail) SMTP**.

- **Reply** in Gmail goes straight to the customer, because Reply-To is set to their email.
- The email has tap-to-call and WhatsApp links, and a button that opens the inquiry in the admin panel.
- If the email can't be sent, the inquiry is still saved and visible in **Admin → Inquiries**.

## 1. Environment variables (secrets)

| Name             | Value                         | Notes                                                    |
| ---------------- | ----------------------------- | -------------------------------------------------------- |
| `WEBHOOK_SECRET` | a long random string          | Required. Must match the `x-webhook-secret` header of the webhook |
| `SMTP_PASS`      | the Google **app password**   | Required. 16 letters, no spaces (see below)              |
| `SMTP_HOST`      | `smtp.gmail.com`              | Optional, this is the default                            |
| `SMTP_PORT`      | `465`                         | Optional, this is the default. Must stay 465 (implicit TLS) |
| `SMTP_USER`      | `sales@matrixpakistan.com`    | Optional, this is the default. Also the From address     |
| `ALERT_TO`       | `sales@matrixpakistan.com`    | Optional, this is the default. Several: comma-separated  |
| `SITE_URL`       | `https://matrixpakistan.com`  | Optional, this is the default. Used for the admin button |

Supabase Edge Functions block outbound ports 25 and 587, so SMTP must use **465 (SSL/TLS)**.

### Create the Google app password

1. Sign in to Google as **sales@matrixpakistan.com**.
2. Turn on **2-Step Verification** for that account (myaccount.google.com → Security). App passwords
   only exist when it is on.
3. Open **myaccount.google.com/apppasswords**, create one named "Website alerts" and copy the 16
   characters (remove the spaces). That is `SMTP_PASS`.

If the app-password page says it isn't available, a Workspace admin has to allow it:
admin.google.com → Security → Authentication → 2-Step Verification (allow users to turn it on).
Changing the account's normal password revokes all app passwords, so you'd need to make a new one.

Gmail allows about 2,000 messages a day per account, far more than this needs.

Alerts are sent **from** sales@ **to** sales@. Gmail shows these messages it sends to itself in
the conversation view and in **Sent**. During the first test, check that one also lands in the
**Inbox**. If it only shows under Sent, put another Workspace address or a Google Group in
`ALERT_TO` (comma-separated is fine). If you can't find an alert, search for `New inquiry` or
`New quote request`.

Make a webhook secret, for example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the secrets (run from the project folder; `npx supabase login` first):

```bash
npx supabase secrets set --project-ref aazzcamvqkobsvglizya \
  WEBHOOK_SECRET=paste-the-random-string \
  SMTP_HOST=smtp.gmail.com \
  SMTP_PORT=465 \
  SMTP_USER=sales@matrixpakistan.com \
  SMTP_PASS=the16letterapppassword \
  ALERT_TO=sales@matrixpakistan.com \
  SITE_URL=https://matrixpakistan.com
```

(You can also set them in the dashboard: **Edge Functions → Secrets**.)

## 2. Deploy the function

```bash
npx supabase functions deploy inquiry-alert --no-verify-jwt --project-ref aazzcamvqkobsvglizya
```

`--no-verify-jwt` is required because the webhook doesn't send a user JWT. The function checks
the `x-webhook-secret` header instead and answers **401** without it.

## 3. Create the Database Webhook

Supabase dashboard → **Database → Webhooks → Create a new hook**:

- **Name:** `inquiry-alert`
- **Table:** `public.inquiries`
- **Events:** `INSERT` only
- **Type:** Supabase Edge Functions
- **Edge Function:** `inquiry-alert` (method POST)
- **HTTP Headers:** add `x-webhook-secret` = the same value as `WEBHOOK_SECRET`.
  (You can keep the default `Content-Type: application/json`. If the dashboard adds an
  `Authorization` header, that's fine too.)

## 4. Test

Send a message from the website's Contact page. Within a few seconds, an email should arrive at
`ALERT_TO`. If it doesn't, check:

- **Edge Functions → inquiry-alert → Logs** for an error such as `sending failed`. `Invalid login` /
  `535-5.7.8 Username and Password not accepted` means the app password is wrong or was revoked.
- **Database → Webhooks → inquiry-alert** (or the `net._http_response` table) for the HTTP status.
  401 means the header doesn't match `WEBHOOK_SECRET`.

Responses: `200 {"ok":true}` sent · `401` bad/missing secret · `400` not an inquiries INSERT ·
`405` not POST · `500` SMTP failure (logged).
