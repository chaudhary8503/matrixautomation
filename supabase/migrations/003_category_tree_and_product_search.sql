-- 003 — Subcategories (parent categories), HMI grouping, and fast product listing/search
--
-- Run once in Supabase → SQL Editor, BEFORE deploying the website code that uses it.
-- Safe to run again. It only adds things; no product data is changed or removed.
--
-- 1. categories.parent_id — a category can belong to a parent category (one level deep:
--    HMI › PanelView 800). Admin → Categories → "Parent category" sets it.
-- 2. The HMI series are put under "HMI", and the "HMI - " prefix is removed from their names
--    (the parent already says HMI). Web addresses (slugs) stay the same, so old links still work.
-- 3. View product_cards — one row per product with its brand and category names and a lowercase
--    search_text, so the website can load ONE page of products at a time (filtered, searched and
--    counted on the server) instead of downloading the whole catalogue.
-- 4. View category_counts — number of published products per category (for the sidebar).
--
-- Both views use security_invoker, so the normal row-level security applies: visitors only ever
-- see published products, exactly as with the products table itself.

-- ---------------------------------------------------------------------------------------------
-- 1. Parent categories
-- ---------------------------------------------------------------------------------------------

alter table public.categories
  add column if not exists parent_id uuid references public.categories (id) on delete set null;
  -- on delete set null: deleting a parent turns its subcategories into top-level categories.

create index if not exists categories_parent_id_idx on public.categories (parent_id);

-- Keep the tree one level deep and free of loops.
create or replace function public.categories_check_tree()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'category_tree: a category cannot be its own parent';
  end if;
  if exists (select 1 from public.categories p where p.id = new.parent_id and p.parent_id is not null) then
    raise exception 'category_tree: the chosen parent is itself a subcategory — only one level of subcategories is allowed';
  end if;
  if exists (select 1 from public.categories c where c.parent_id = new.id) then
    raise exception 'category_tree: this category has subcategories, so it cannot be put under another category';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_check_tree on public.categories;
create trigger categories_check_tree
  before insert or update of parent_id on public.categories
  for each row execute function public.categories_check_tree();

-- ---------------------------------------------------------------------------------------------
-- 2. Group the HMI series under "HMI" and drop the redundant "HMI - " prefix from their names
-- ---------------------------------------------------------------------------------------------

do $$
declare
  hmi uuid;
begin
  select id into hmi from public.categories where slug = 'human-machine-interface-solutions';
  if hmi is null then
    raise notice 'HMI parent category (slug human-machine-interface-solutions) not found — skipping HMI grouping';
    return;
  end if;

  update public.categories
     set parent_id = hmi
   where id <> hmi
     and parent_id is distinct from hmi
     and (slug like 'hmi-%' or slug = 'mitsubishi-hmi');

  -- "HMI - PanelView 800" → "PanelView 800" (only names that still start with the prefix)
  update public.categories
     set name = regexp_replace(name, '^\s*HMI\s*[-–—]\s*', '')
   where parent_id = hmi
     and name ~ '^\s*HMI\s*[-–—]\s*\S';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. product_cards: the product listing, with names for display and a search column
-- ---------------------------------------------------------------------------------------------

create or replace view public.product_cards
with (security_invoker = true)
as
select
  p.id,
  p.name,
  p.slug,
  p.description,
  p.image_url,
  p.sort_order,
  p.is_published,
  p.brand_id,
  b.name as brand_name,
  b.slug as brand_slug,
  p.category_id,
  c.name as category_name,
  c.slug as category_slug,
  c.sort_order as category_sort_order,
  c.parent_id as category_parent_id,
  pc.name as category_parent_name,
  -- Everything a visitor might type: part number, description, brand, category and its parent.
  lower(concat_ws(' ', p.name, p.description, b.name, c.name, pc.name)) as search_text
from public.products p
left join public.brands b on b.id = p.brand_id
left join public.categories c on c.id = p.category_id
left join public.categories pc on pc.id = c.parent_id;

grant select on public.product_cards to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. category_counts: published products per category
-- ---------------------------------------------------------------------------------------------

create or replace view public.category_counts
with (security_invoker = true)
as
select p.category_id, count(*)::int as product_count
from public.products p
where p.is_published
group by p.category_id;

grant select on public.category_counts to anon, authenticated;

-- Tell the API (PostgREST) about the new column and views right away.
notify pgrst, 'reload schema';
