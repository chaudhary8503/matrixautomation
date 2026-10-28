import type { Category } from "@/types/database";

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** Top-level categories, each followed by its subcategories (alphabetical, like the website sidebar). */
export function categoryTree<T extends Pick<Category, "id" | "name" | "parent_id">>(categories: T[]) {
  const ids = new Set(categories.map((c) => c.id));
  const isRoot = (c: T) => !c.parent_id || !ids.has(c.parent_id);
  return categories
    .filter(isRoot)
    .sort(byName)
    .map((parent) => ({
      parent,
      children: categories.filter((c) => c.parent_id === parent.id).sort(byName),
    }));
}

/** Options for a category dropdown: "HMI", "HMI › OptixPanel", … in tree order. */
export function categoryOptions<T extends Pick<Category, "id" | "name" | "parent_id">>(categories: T[]) {
  return categoryTree(categories).flatMap(({ parent, children }) => [
    { id: parent.id, label: parent.name },
    ...children.map((c) => ({ id: c.id, label: `${parent.name} › ${c.name}` })),
  ]);
}

/** A category's id plus its subcategories' ids (choosing "HMI" in a filter includes all HMI series). */
export const withSubcategories = (categories: Pick<Category, "id" | "parent_id">[], id: string) => [
  id,
  ...categories.filter((c) => c.parent_id === id).map((c) => c.id),
];
