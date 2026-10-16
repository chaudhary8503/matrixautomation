-- 002 — Spam guard for the contact / quote forms
--
-- Run once in Supabase → SQL Editor (safe to run again).
--
-- Visitors may INSERT into public.inquiries (RLS) but cannot read it, so the checks run in a
-- SECURITY DEFINER trigger function. It rejects an insert when:
--   * 20 or more inquiries were created in the last 10 minutes (global flood guard), or
--   * the same email (case-insensitive) or the same phone sent the same message in the last 5 minutes.
--
-- Error codes: PostgREST turns ERRCODE 'PTxxx' into HTTP status xxx, so the website receives
--   PT429 (429 Too Many Requests) → "Too many messages right now…"
--   PT409 (409 Conflict)          → "We already have this message."
-- The messages start with a fixed tag (inquiry_rate_limited / inquiry_duplicate) that the
-- frontend also recognises (src/components/site/InquiryForm.tsx).

create index if not exists inquiries_created_at_idx on public.inquiries (created_at desc);

create or replace function public.inquiry_spam_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Admins are never limited.
  if public.is_admin() then
    return new;
  end if;

  if (
    select count(*)
    from public.inquiries i
    where i.created_at > pg_catalog.now() - interval '10 minutes'
  ) >= 20 then
    raise exception 'inquiry_rate_limited: too many inquiries in the last 10 minutes, please try again later'
      using errcode = 'PT429';
  end if;

  if exists (
    select 1
    from public.inquiries i
    where i.created_at > pg_catalog.now() - interval '5 minutes'
      and i.message is not distinct from new.message
      and (
        (new.email is not null and pg_catalog.lower(i.email) = pg_catalog.lower(new.email))
        or (new.phone is not null and i.phone = new.phone)
      )
  ) then
    raise exception 'inquiry_duplicate: this message was already received a moment ago'
      using errcode = 'PT409';
  end if;

  return new;
end;
$$;

-- Trigger functions can't be called directly anyway; this just keeps the API surface clean.
revoke all on function public.inquiry_spam_guard() from public, anon, authenticated;

drop trigger if exists inquiry_spam_guard on public.inquiries;
create trigger inquiry_spam_guard
  before insert on public.inquiries
  for each row execute function public.inquiry_spam_guard();
