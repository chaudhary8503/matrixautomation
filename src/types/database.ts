/**
 * Database types for the Supabase schema (supabase/001_schema.sql).
 *
 * Written by hand in the same shape the Supabase CLI generates, so you can
 * replace this file with the generated version at any time:
 *
 *   npx supabase login
 *   npx supabase gen types typescript --project-id aazzcamvqkobsvglizya --schema public > src/types/database.ts
 *
 * (then keep the "convenience types" block at the bottom).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

/** Insert = required columns + optional columns that have a default. */
type InsertOf<Row, Optional extends keyof Row> = Omit<Row, Optional> & Partial<Pick<Row, Optional>>;

type BrandRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  sort_order: number;
} & Timestamps;

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  description: string | null;
  sort_order: number;
  /** Parent category (one level deep), e.g. "PanelView 800" → "HMI". Migration 003. */
  parent_id: string | null;
} & Timestamps;

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  brand_id: string;
  category_id: string;
  description: string | null;
  specs: Json;
  image_url: string | null;
  datasheet_url: string | null;
  is_published: boolean;
  sort_order: number;
} & Timestamps;

type ProductImageRow = {
  id: string;
  product_id: string;
  url: string;
  alt: string | null;
  sort_order: number;
  created_at: string;
};

type CategoryDocumentRow = {
  id: string;
  category_id: string;
  title: string;
  doc_type: string;
  file_url: string;
  sort_order: number;
} & Timestamps;

type IndustryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  features: string[];
  sort_order: number;
} & Timestamps;

type IndustryClientRow = {
  id: string;
  industry_id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  sort_order: number;
} & Timestamps;

type InquiryRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
  product_id: string | null;
  product_name: string | null;
  source: Database["public"]["Enums"]["inquiry_source"];
  page_url: string | null;
  status: Database["public"]["Enums"]["inquiry_status"];
  admin_notes: string | null;
} & Timestamps;

type SiteSettingsRow = {
  id: number;
  company_name: string;
  tagline: string | null;
  address_lines: string[];
  phones: string[];
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  stats: Json;
  social: Json;
  updated_at: string;
};

type UserRoleRow = {
  id: string;
  user_id: string;
  role: Database["public"]["Enums"]["app_role"];
  created_at: string;
};

type Common = "id" | "created_at" | "updated_at" | "sort_order";
type Nullable<R> = { [K in keyof R]: null extends R[K] ? K : never }[keyof R];

type Table<Row, Optional extends keyof Row, Rel extends unknown[] = []> = {
  Row: Row;
  Insert: InsertOf<Row, Optional>;
  Update: Partial<Row>;
  Relationships: Rel;
};

export type Database = {
  public: {
    Tables: {
      brands: Table<BrandRow, Common | Nullable<BrandRow>>;
      categories: Table<CategoryRow, Common | Nullable<CategoryRow>>;
      products: Table<
        ProductRow,
        Common | Nullable<ProductRow> | "specs" | "is_published",
        [
          {
            foreignKeyName: "products_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ]
      >;
      product_images: Table<
        ProductImageRow,
        "id" | "created_at" | "sort_order" | "alt",
        [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ]
      >;
      category_documents: Table<
        CategoryDocumentRow,
        Common | "doc_type",
        [
          {
            foreignKeyName: "category_documents_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ]
      >;
      industries: Table<IndustryRow, Common | Nullable<IndustryRow> | "features">;
      industry_clients: Table<
        IndustryClientRow,
        Common | Nullable<IndustryClientRow>,
        [
          {
            foreignKeyName: "industry_clients_industry_id_fkey";
            columns: ["industry_id"];
            isOneToOne: false;
            referencedRelation: "industries";
            referencedColumns: ["id"];
          },
        ]
      >;
      inquiries: Table<
        InquiryRow,
        "id" | "created_at" | "updated_at" | "source" | "status" | Nullable<InquiryRow>,
        [
          {
            foreignKeyName: "inquiries_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ]
      >;
      site_settings: Table<
        SiteSettingsRow,
        "id" | "updated_at" | "company_name" | "address_lines" | "phones" | "stats" | "social" | Nullable<SiteSettingsRow>
      >;
      user_roles: Table<UserRoleRow, "id" | "created_at">;
    };
    Views: {
      /** One row per product with brand/category names and a search column (migration 003). */
      product_cards: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          image_url: string | null;
          sort_order: number;
          is_published: boolean;
          brand_id: string;
          brand_name: string | null;
          brand_slug: string | null;
          category_id: string;
          category_name: string | null;
          category_slug: string | null;
          category_sort_order: number | null;
          category_parent_id: string | null;
          category_parent_name: string | null;
          search_text: string;
        };
        Relationships: [];
      };
      /** Published products per category (migration 003). */
      category_counts: {
        Row: { category_id: string; product_count: number };
        Relationships: [];
      };
      brand_categories: {
        Row: {
          brand_id: string;
          category_id: string;
          category_name: string;
          category_slug: string;
          category_sort_order: number;
          product_count: number;
        };
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      app_role: "admin";
      inquiry_status: "new" | "replied" | "closed";
      inquiry_source: "contact" | "product" | "chatbot" | "other";
    };
    CompositeTypes: Record<string, never>;
  };
};

/* ---------------------------------------------------------------------------
 * Convenience types (keep these if you regenerate the file above)
 * ------------------------------------------------------------------------- */
type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export type Brand = Tables<"brands">;
export type Category = Tables<"categories">;
export type Product = Tables<"products">;
export type ProductImage = Tables<"product_images">;
export type CategoryDocument = Tables<"category_documents">;
export type Industry = Tables<"industries">;
export type IndustryClient = Tables<"industry_clients">;
export type Inquiry = Tables<"inquiries">;
export type SiteSettings = Tables<"site_settings">;
export type BrandCategory = Views<"brand_categories">;

/** One row of a product's specification table. */
export type SpecRow = { label: string; value: string };
/** One homepage counter, e.g. { label: "Global Brands", value: 50, suffix: "+" }. */
export type Stat = { label: string; value: number; suffix?: string };
