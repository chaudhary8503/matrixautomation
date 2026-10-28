import type { Category } from "@/types/database";

/** A category with its product counts and (for parents) its subcategories. */
export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  /** Parent node for subcategories, null for top-level categories. */
  parent: CategoryNode | null;
  children: CategoryNode[];
  /** Products in this category itself. */
  own: number;
  /** Products in this category and all its subcategories — what the sidebar shows. */
  total: number;
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/**
 * Builds the category tree (one level deep: parent › subcategory), sorted alphabetically.
 * Categories (and parents) without products are left out, so nothing leads to an empty page —
 * except `keepSlug`, the currently selected one, which always stays visible.
 */
export function buildCategoryTree(
  categories: Category[],
  counts: Map<string, number>,
  { keepSlug = "" }: { keepSlug?: string } = {},
): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const c of categories) {
    nodes.set(c.id, {
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      sort_order: c.sort_order,
      parent: null,
      children: [],
      own: counts.get(c.id) ?? 0,
      total: 0,
    });
  }

  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
  const roots: CategoryNode[] = [];
  for (const c of categories) {
    const node = nodes.get(c.id)!;
    const parent = c.parent_id ? nodes.get(c.parent_id) : undefined;
    // A missing parent, or a deeper level (which the database doesn't allow) → treat as top-level.
    if (parent && parent.id !== node.id && !parentOf.get(parent.id)) {
      node.parent = parent;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const keep = (n: CategoryNode) => n.total > 0 || n.slug === keepSlug;
  for (const root of roots) {
    for (const child of root.children) child.total = child.own;
    root.total = root.own + root.children.reduce((sum, c) => sum + c.total, 0);
    root.children = root.children.filter(keep).sort(byName);
  }
  // A parent stays if it has products, is selected, or still has a (selected) subcategory.
  return roots.filter((r) => keep(r) || r.children.length > 0).sort(byName);
}

/** All nodes, parents followed by their subcategories. */
export const flattenTree = (tree: CategoryNode[]) => tree.flatMap((n) => [n, ...n.children]);

/**
 * The category for `slug` and the ids its product list covers (a parent also covers its
 * subcategories), straight from the category list — so products can load without waiting for counts.
 */
export function categoryFilter(categories: Category[] | undefined, slug: string) {
  const category = slug ? categories?.find((c) => c.slug === slug) : undefined;
  if (!category) return null;
  const parent = category.parent_id ? (categories?.find((c) => c.id === category.parent_id) ?? null) : null;
  const ids = [category.id, ...(categories ?? []).filter((c) => c.parent_id === category.id).map((c) => c.id)];
  return { category, parent, ids, label: parent ? `${parent.name} ${category.name}` : category.name };
}
