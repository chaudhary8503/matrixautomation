import { keepPreviousData, queryOptions, useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import type {
  Brand,
  BrandCategory,
  Category,
  CategoryDocument,
  Industry,
  IndustryClient,
  Json,
  SiteSettings,
  SpecRow,
  Stat,
  TablesInsert,
} from "@/types/database";

/*
 * Every public query is defined once as `queryOptions` (key + fetch function) and used both by
 * the hooks below and by `prefetchForPath` (link hover), so a prefetch fills exactly the cache
 * entry the next page reads.
 */

/* ---------------------------------------------------------------------------
 * Site settings (contact details, stats) — one row, id = 1
 * ------------------------------------------------------------------------- */

export type Settings = Omit<SiteSettings, "stats" | "social"> & {
  stats: Stat[];
  social: Record<string, string>;
};

/** Used until the database answers (and if it is ever unreachable) so the
 *  header/footer never render empty. Mirrors the seed row in the schema. */
export const FALLBACK_SETTINGS: Settings = {
  id: 1,
  company_name: "Matrix Automation & Control",
  tagline: "Industrial Automation, Instrumentation & Aviation Fueling",
  address_lines: [
    "Office # 3, Plot # 6-C, Lane-1, Sehar Commercial,",
    "DHA Phase-7, Karachi, Post code: 75500",
    "Pakistan",
  ],
  phones: ["+92-21-35161020", "+92-21-35161021"],
  mobile: "+92-300-8256712",
  whatsapp: "923008256712",
  email: "sales@matrixpakistan.com",
  stats: [
    { label: "Products Available", value: 5000, suffix: "+" },
    { label: "Global Brands", value: 50, suffix: "+" },
    { label: "Happy Clients", value: 500, suffix: "+" },
    { label: "Years Experience", value: 15, suffix: "+" },
  ],
  social: {},
  updated_at: "",
};

function isStat(x: unknown): x is Stat {
  return !!x && typeof x === "object" && typeof (x as Stat).label === "string" && typeof (x as Stat).value === "number";
}

export const siteSettingsQuery = queryOptions({
  queryKey: ["site_settings"],
  staleTime: 10 * 60 * 1000,
  queryFn: async (): Promise<Settings> => {
    const { data, error } = await db.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (!data) return FALLBACK_SETTINGS;
    const stats = Array.isArray(data.stats) ? data.stats.filter(isStat) : [];
    const social =
      data.social && typeof data.social === "object" && !Array.isArray(data.social)
        ? (Object.fromEntries(
            Object.entries(data.social).filter(([, v]) => typeof v === "string"),
          ) as Record<string, string>)
        : {};
    return { ...data, stats, social };
  },
});

export function useSiteSettings() {
  const query = useQuery(siteSettingsQuery);
  return { ...query, settings: query.data ?? FALLBACK_SETTINGS };
}

/* ---------------------------------------------------------------------------
 * Header search — quick product lookup (published only, enforced by RLS too)
 * ------------------------------------------------------------------------- */

export type ProductSearchHit = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  brand: { name: string } | null;
  category: { name: string } | null;
};

/** Escape characters that have special meaning in a PostgREST ilike filter. */
function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** "PanelView 800  Plus" → ["panelview", "800", "plus"]: every word must match somewhere. */
const searchWords = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);

export function useProductSearch(term: string) {
  const q = term.trim();
  return useQuery({
    queryKey: ["product_search", q.toLowerCase()],
    enabled: q.length >= 2,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ProductSearchHit[]> => {
      let req = db
        .from("product_cards")
        .select("id, name, slug, image_url, brand_name, category_name, category_parent_name")
        .eq("is_published", true);
      for (const w of searchWords(q)) req = req.ilike("search_text", likePattern(w));
      const { data, error } = await req.order("sort_order").order("name").limit(8);
      if (error) throw error;
      return data.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        image_url: r.image_url,
        brand: r.brand_name ? { name: r.brand_name } : null,
        category: r.category_name
          ? { name: r.category_parent_name ? `${r.category_parent_name} ${r.category_name}` : r.category_name }
          : null,
      }));
    },
  });
}

/* ---------------------------------------------------------------------------
 * Catalogue — always loaded one page at a time (the catalogue has thousands of products)
 * ------------------------------------------------------------------------- */

/** Products per page on the Products and brand pages. */
export const PAGE_SIZE = 48;

const CARD_VIEW_FIELDS =
  "id, name, slug, description, image_url, sort_order, brand_id, brand_name, brand_slug, category_id, category_name, category_slug, category_sort_order, category_parent_name" as const;

export type ProductCardData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  brand_id: string;
  category_id: string;
  brand: { id: string; name: string; slug: string } | null;
  category: { id: string; name: string; slug: string; sort_order: number; parent_name: string | null } | null;
};

type CardRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  brand_id: string;
  brand_name: string | null;
  brand_slug: string | null;
  category_id: string;
  category_name: string | null;
  category_slug: string | null;
  category_sort_order: number | null;
  category_parent_name: string | null;
};

const toCard = (r: CardRow): ProductCardData => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  description: r.description,
  image_url: r.image_url,
  sort_order: r.sort_order,
  brand_id: r.brand_id,
  category_id: r.category_id,
  brand: r.brand_name && r.brand_slug ? { id: r.brand_id, name: r.brand_name, slug: r.brand_slug } : null,
  category:
    r.category_name && r.category_slug
      ? {
          id: r.category_id,
          name: r.category_name,
          slug: r.category_slug,
          sort_order: r.category_sort_order ?? 0,
          parent_name: r.category_parent_name,
        }
      : null,
});

export type ProductPageParams = {
  /** Only these categories (a parent category's id plus its subcategories' ids). Empty = all. */
  categoryIds?: string[];
  brandId?: string;
  q?: string;
  /** 1-based. */
  page: number;
};

export type ProductPage = { items: ProductCardData[]; total: number };

/** One page of published products — filtered, searched, sorted and counted by the server. */
export const productPageQuery = ({ categoryIds = [], brandId = "", q = "", page }: ProductPageParams) =>
  queryOptions({
    queryKey: ["product_page", { cats: [...categoryIds].sort().join(","), brand: brandId, q: q.trim().toLowerCase(), page }],
    queryFn: async (): Promise<ProductPage> => {
      const build = (head: boolean) => {
        let req = db.from("product_cards").select(CARD_VIEW_FIELDS, { count: "exact", head }).eq("is_published", true);
        if (categoryIds.length) req = req.in("category_id", categoryIds);
        if (brandId) req = req.eq("brand_id", brandId);
        for (const w of searchWords(q)) req = req.ilike("search_text", likePattern(w));
        return req;
      };
      const from = (Math.max(1, page) - 1) * PAGE_SIZE;
      const { data, count, error } = await build(false)
        .order("sort_order")
        .order("name")
        .order("id") // stable order, so no product shows up on two pages
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        // A page past the end (e.g. an old link after products were removed): report the real total,
        // so the page can send the visitor to the last page that exists.
        if (error.code === "PGRST103") {
          const { count: total, error: countError } = await build(true);
          if (countError) throw countError;
          return { items: [], total: total ?? 0 };
        }
        throw error;
      }
      return { items: (data as CardRow[]).map(toCard), total: count ?? 0 };
    },
  });

/** Keeps the previous page on screen while the next one loads (no skeleton flash between pages). */
export const useProductPage = (params: ProductPageParams, enabled = true) =>
  useQuery({ ...productPageQuery(params), enabled, placeholderData: keepPreviousData });

/**
 * How many products each category has in the current search (only the category ids are fetched,
 * so even a broad search stays light). Without a search the cheaper category_counts view is used.
 */
export const searchCategoryCountsQuery = (q: string) =>
  queryOptions({
    queryKey: ["search_category_counts", q.trim().toLowerCase()],
    queryFn: async (): Promise<Record<string, number>> => {
      let req = db.from("product_cards").select("category_id").eq("is_published", true);
      for (const w of searchWords(q)) req = req.ilike("search_text", likePattern(w));
      const { data, error } = await req;
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data) counts[r.category_id] = (counts[r.category_id] ?? 0) + 1;
      return counts;
    },
  });

/** Published products per category (category id → count). */
export const categoryCountsQuery = queryOptions({
  queryKey: ["category_counts"],
  queryFn: async (): Promise<Record<string, number>> => {
    const { data, error } = await db.from("category_counts").select("category_id, product_count");
    if (error) throw error;
    return Object.fromEntries(data.map((r) => [r.category_id, r.product_count]));
  },
});

export const useCategoryCounts = (q = "") =>
  useQuery(q.trim() ? searchCategoryCountsQuery(q) : categoryCountsQuery);

/** A few other products from the same brand, preferably in the same category. */
export const relatedProductsQuery = (product: { id: string; brand_id: string; category_id: string }) =>
  queryOptions({
    queryKey: ["related_products", product.id],
    queryFn: async (): Promise<ProductCardData[]> => {
      const fetchSome = async (sameCategory: boolean) => {
        let req = db
          .from("product_cards")
          .select(CARD_VIEW_FIELDS)
          .eq("is_published", true)
          .eq("brand_id", product.brand_id)
          .neq("id", product.id);
        if (sameCategory) req = req.eq("category_id", product.category_id);
        const { data, error } = await req.order("sort_order").order("name").limit(4);
        if (error) throw error;
        return (data as CardRow[]).map(toCard);
      };
      const sameCategory = await fetchSome(true);
      return sameCategory.length ? sameCategory : fetchSome(false);
    },
  });

export const useRelatedProducts = (product: { id: string; brand_id: string; category_id: string } | null | undefined) =>
  useQuery({
    ...relatedProductsQuery(product ?? { id: "", brand_id: "", category_id: "" }),
    enabled: !!product,
  });

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async (): Promise<Category[]> => {
    const { data, error } = await db.from("categories").select("*").order("sort_order").order("name");
    if (error) throw error;
    return data;
  },
});

export const useCategories = () => useQuery(categoriesQuery);

export const brandsQuery = queryOptions({
  queryKey: ["brands"],
  queryFn: async (): Promise<Brand[]> => {
    const { data, error } = await db.from("brands").select("*").order("sort_order").order("name");
    if (error) throw error;
    return data;
  },
});

export const useBrands = () => useQuery(brandsQuery);

export const brandQuery = (slug: string) =>
  queryOptions({
    queryKey: ["brand", slug],
    queryFn: async (): Promise<Brand | null> => {
      const { data, error } = await db.from("brands").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const useBrand = (slug: string | undefined) => useQuery({ ...brandQuery(slug ?? ""), enabled: !!slug });

/** Categories that a brand has published products in, with counts (the brand page sidebar). */
export const brandCategoriesQuery = (brandId: string) =>
  queryOptions({
    queryKey: ["brand_categories", brandId],
    queryFn: async (): Promise<BrandCategory[]> => {
      const { data, error } = await db
        .from("brand_categories")
        .select("*")
        .eq("brand_id", brandId)
        .order("category_sort_order")
        .order("category_name");
      if (error) throw error;
      return data;
    },
  });

export const useBrandCategories = (brandId: string | undefined) =>
  useQuery({ ...brandCategoriesQuery(brandId ?? ""), enabled: !!brandId });

/** Published products per brand (brand id → count), from the small brand_categories view. */
export const brandCountsQuery = queryOptions({
  queryKey: ["brand_counts"],
  queryFn: async (): Promise<Record<string, number>> => {
    const { data, error } = await db.from("brand_categories").select("brand_id, product_count");
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const r of data) counts[r.brand_id] = (counts[r.brand_id] ?? 0) + r.product_count;
    return counts;
  },
});

export const useBrandCounts = () => useQuery(brandCountsQuery);

export const categoryDocumentsQuery = (categoryId: string) =>
  queryOptions({
    queryKey: ["category_documents", categoryId],
    queryFn: async (): Promise<CategoryDocument[]> => {
      const { data, error } = await db
        .from("category_documents")
        .select("*")
        .eq("category_id", categoryId)
        .order("sort_order")
        .order("title");
      if (error) throw error;
      return data;
    },
  });

export const useCategoryDocuments = (categoryId: string | undefined) =>
  useQuery({ ...categoryDocumentsQuery(categoryId ?? ""), enabled: !!categoryId });

/* ---------------------------------------------------------------------------
 * Single product
 * ------------------------------------------------------------------------- */

export type ProductDetail = Omit<ProductCardData, "brand" | "category"> & {
  specs: SpecRow[];
  datasheet_url: string | null;
  brand: { id: string; name: string; slug: string; logo_url: string | null } | null;
  category: { id: string; name: string; slug: string; parent_id: string | null } | null;
  images: { id: string; url: string; alt: string | null; sort_order: number }[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

function toSpecs(json: Json): SpecRow[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((r) =>
    r && typeof r === "object" && !Array.isArray(r) && typeof r.label === "string" && typeof r.value === "string"
      ? [{ label: r.label, value: r.value }]
      : [],
  );
}

/** Looks a product up by slug — or by id, so old links (/products/<uuid>) still work. */
export const productQuery = (slugOrId: string) =>
  queryOptions({
    queryKey: ["product", slugOrId],
    queryFn: async (): Promise<ProductDetail | null> => {
      const { data, error } = await db
        .from("products")
        .select(
          "id, name, slug, description, image_url, datasheet_url, specs, sort_order, brand_id, category_id, brand:brands(id, name, slug, logo_url), category:categories(id, name, slug, parent_id), images:product_images(id, url, alt, sort_order)",
        )
        .eq(isUuid(slugOrId) ? "id" : "slug", slugOrId)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        specs: toSpecs(data.specs),
        images: [...data.images].sort((a, b) => a.sort_order - b.sort_order),
      };
    },
  });

export const useProduct = (slugOrId: string | undefined) =>
  useQuery({ ...productQuery(slugOrId ?? ""), enabled: !!slugOrId });

/* ---------------------------------------------------------------------------
 * Industries
 * ------------------------------------------------------------------------- */

export type IndustryWithClients = Industry & { clients: IndustryClient[] };

export const industriesQuery = queryOptions({
  queryKey: ["industries"],
  queryFn: async (): Promise<IndustryWithClients[]> => {
    const { data, error } = await db
      .from("industries")
      .select("*, clients:industry_clients(*)")
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return data.map((i) => ({
      ...i,
      clients: [...i.clients].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    }));
  },
});

export const useIndustries = () => useQuery(industriesQuery);

/* ---------------------------------------------------------------------------
 * Prefetch (link hover / touch) — warms the cache for the page a link points to
 * ------------------------------------------------------------------------- */

/** Starts loading the data `pathname` needs. Cheap to call often: fresh data is not refetched. */
export async function prefetchForPath(client: QueryClient, pathname: string) {
  const [, section, slug] = pathname.replace(/\/+$/, "").split("/");

  if (!section) {
    await Promise.all([
      client.prefetchQuery(brandsQuery),
      client.prefetchQuery(categoriesQuery),
      client.prefetchQuery(categoryCountsQuery),
      client.prefetchQuery(industriesQuery),
    ]);
  } else if (section === "products" && slug) {
    const product = await client.fetchQuery(productQuery(slug)).catch(() => null);
    if (product) {
      await Promise.all([
        client.prefetchQuery(relatedProductsQuery(product)),
        client.prefetchQuery(categoryDocumentsQuery(product.category_id)),
      ]);
    }
  } else if (section === "products") {
    await Promise.all([
      client.prefetchQuery(categoriesQuery),
      client.prefetchQuery(categoryCountsQuery),
      client.prefetchQuery(productPageQuery({ page: 1 })),
    ]);
  } else if (section === "brands" && slug) {
    const brand = await client.fetchQuery(brandQuery(slug)).catch(() => null);
    if (brand) {
      await Promise.all([
        client.prefetchQuery(categoriesQuery),
        client.prefetchQuery(brandCategoriesQuery(brand.id)),
        client.prefetchQuery(productPageQuery({ brandId: brand.id, page: 1 })),
      ]);
    }
  } else if (section === "brands") {
    await Promise.all([client.prefetchQuery(brandsQuery), client.prefetchQuery(brandCountsQuery)]);
  } else if (section === "industries") {
    await client.prefetchQuery(industriesQuery);
  }
}

/* ---------------------------------------------------------------------------
 * Inquiries (contact form, product quote form)
 * ------------------------------------------------------------------------- */

export type InquiryInput = Pick<
  TablesInsert<"inquiries">,
  "name" | "email" | "phone" | "company" | "message" | "product_id" | "product_name" | "source"
>;

export function useSubmitInquiry() {
  return useMutation({
    mutationFn: async (input: InquiryInput) => {
      // No .select() after insert: visitors may add inquiries but not read them back.
      const { error } = await db.from("inquiries").insert({
        ...input,
        page_url: window.location.href.slice(0, 1000),
      });
      if (error) throw error;
    },
  });
}
