import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Brand, Category, CategoryDocument, Enums, Industry, IndustryClient, Inquiry, Json, SpecRow } from "@/types/database";

/** After any admin change: refresh everything (admin lists AND the public pages' cache). */
export function useRefreshAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export type AdminProductRow = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  is_published: boolean;
  sort_order: number;
  updated_at: string;
  brand_id: string;
  category_id: string;
  specs: Json;
  datasheet_url: string | null;
  brand: { name: string } | null;
  category: { name: string } | null;
};

export function useAdminProducts() {
  return useQuery({
    queryKey: ["admin", "products"],
    queryFn: async (): Promise<AdminProductRow[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, image_url, is_published, sort_order, updated_at, brand_id, category_id, specs, datasheet_url, brand:brands(name), category:categories(name)")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  brand_id: string;
  category_id: string;
  description: string | null;
  specs: SpecRow[];
  image_url: string | null;
  datasheet_url: string | null;
  is_published: boolean;
  sort_order: number;
  images: { id: string; url: string; alt: string | null; sort_order: number }[];
};

export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["admin", "product", id],
    enabled: !!id,
    queryFn: async (): Promise<AdminProduct | null> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, brand_id, category_id, description, specs, image_url, datasheet_url, is_published, sort_order, images:product_images(id, url, alt, sort_order)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const specs = Array.isArray(data.specs)
        ? data.specs.flatMap((r) =>
            r && typeof r === "object" && !Array.isArray(r) && typeof r.label === "string" && typeof r.value === "string"
              ? [{ label: r.label, value: r.value }]
              : [],
          )
        : [];
      return { ...data, specs, images: [...data.images].sort((a, b) => a.sort_order - b.sort_order) };
    },
  });
}

export function useAdminBrands() {
  return useQuery({
    queryKey: ["admin", "brands"],
    queryFn: async (): Promise<Brand[]> => {
      const { data, error } = await supabase.from("brands").select("*").order("sort_order").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminCategories() {
  return useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async (): Promise<(Category & { documents: CategoryDocument[] })[]> => {
      const { data, error } = await supabase.from("categories").select("*, documents:category_documents(*)").order("sort_order").order("name");
      if (error) throw error;
      return data.map((c) => ({ ...c, documents: [...c.documents].sort((a, b) => a.sort_order - b.sort_order) }));
    },
  });
}

export function useAdminIndustries() {
  return useQuery({
    queryKey: ["admin", "industries"],
    queryFn: async (): Promise<(Industry & { clients: IndustryClient[] })[]> => {
      const { data, error } = await supabase.from("industries").select("*, clients:industry_clients(*)").order("sort_order").order("name");
      if (error) throw error;
      return data.map((i) => ({ ...i, clients: [...i.clients].sort((a, b) => a.sort_order - b.sort_order) }));
    },
  });
}

export type InquiryFilter = Enums<"inquiry_status"> | "all";

export function useInquiries(status: InquiryFilter) {
  return useQuery({
    queryKey: ["admin", "inquiries", status],
    queryFn: async (): Promise<Inquiry[]> => {
      let q = supabase.from("inquiries").select("*").order("created_at", { ascending: false }).limit(500);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useInquiryCounts() {
  return useQuery({
    queryKey: ["admin", "inquiry_counts"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const statuses = ["new", "replied", "closed"] as const;
      const res = await Promise.all(
        statuses.map(async (s) => {
          const { count, error } = await supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", s);
          if (error) throw error;
          return [s, count ?? 0] as const;
        }),
      );
      const counts = Object.fromEntries(res) as Record<Enums<"inquiry_status">, number>;
      return { ...counts, all: counts.new + counts.replied + counts.closed };
    },
  });
}

/** Sort order for a new item: after the current last one. */
export function nextSortOrder(rows: { sort_order: number }[] | undefined) {
  return rows && rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 10 : 0;
}

/** Saves a new order (sort_order = 0, 10, 20…) for rows of a table. */
export async function saveOrder(table: "brands" | "categories" | "industries" | "industry_clients" | "category_documents" | "product_images", ids: string[]) {
  const results = await Promise.all(ids.map((id, i) => supabase.from(table).update({ sort_order: i * 10 }).eq("id", id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
