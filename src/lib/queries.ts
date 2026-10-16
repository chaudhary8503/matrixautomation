import { queryOptions, useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
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
 * Header search — products by name (published only, enforced by RLS too)
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

export function useProductSearch(term: string) {
  const q = term.trim();
  return useQuery({
    queryKey: ["product_search", q.toLowerCase()],
    enabled: q.length >= 2,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ProductSearchHit[]> => {
      const { data, error } = await db
        .from("products")
        .select("id, name, slug, image_url, brand:brands(name), category:categories(name)")
        .eq("is_published", true)
        .ilike("name", likePattern(q))
        .order("sort_order")
        .order("name")
        .limit(8);
      if (error) throw error;
      return data;
    },
  });
}

/* ---------------------------------------------------------------------------
 * Catalogue
 * ------------------------------------------------------------------------- */

const CARD_FIELDS =
  "id, name, slug, description, image_url, sort_order, brand_id, category_id, brand:brands(id, name, slug), category:categories(id, name, slug, sort_order)" as const;

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
  category: { id: string; name: string; slug: string; sort_order: number } | null;
};

/** Every published product, for listing pages. Filtering happens in the browser —
 *  instant, and fine for a catalogue of up to a few thousand products. */
export const catalogQuery = queryOptions({
  queryKey: ["catalog"],
  queryFn: async (): Promise<ProductCardData[]> => {
    const { data, error } = await db
      .from("products")
      .select(CARD_FIELDS)
      .eq("is_published", true)
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return data;
  },
});

export const useCatalog = () => useQuery(catalogQuery);

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

/** Categories that a brand has published products in, with counts (the filter buttons). */
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

export const brandProductsQuery = (brandId: string) =>
  queryOptions({
    queryKey: ["brand_products", brandId],
    queryFn: async (): Promise<ProductCardData[]> => {
      const { data, error } = await db
        .from("products")
        .select(CARD_FIELDS)
        .eq("brand_id", brandId)
        .eq("is_published", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

export const useBrandProducts = (brandId: string | undefined) =>
  useQuery({ ...brandProductsQuery(brandId ?? ""), enabled: !!brandId });

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
  category: { id: string; name: string; slug: string } | null;
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
          "id, name, slug, description, image_url, datasheet_url, specs, sort_order, brand_id, category_id, brand:brands(id, name, slug, logo_url), category:categories(id, name, slug), images:product_images(id, url, alt, sort_order)",
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
      client.prefetchQuery(catalogQuery),
      client.prefetchQuery(industriesQuery),
    ]);
  } else if (section === "products" && slug) {
    const product = await client.fetchQuery(productQuery(slug)).catch(() => null);
    if (product) {
      await Promise.all([
        client.prefetchQuery(brandProductsQuery(product.brand_id)),
        client.prefetchQuery(categoryDocumentsQuery(product.category_id)),
      ]);
    }
  } else if (section === "products") {
    await Promise.all([client.prefetchQuery(catalogQuery), client.prefetchQuery(categoriesQuery)]);
  } else if (section === "brands" && slug) {
    const brand = await client.fetchQuery(brandQuery(slug)).catch(() => null);
    if (brand) {
      await Promise.all([
        client.prefetchQuery(brandCategoriesQuery(brand.id)),
        client.prefetchQuery(brandProductsQuery(brand.id)),
      ]);
    }
  } else if (section === "brands") {
    await Promise.all([client.prefetchQuery(brandsQuery), client.prefetchQuery(catalogQuery)]);
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
