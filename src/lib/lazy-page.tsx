import { lazy, useState, type ComponentType } from "react";

export type LazyPage = ComponentType & { preload: () => Promise<void> };

/**
 * React.lazy with a `preload()`. Once the chunk has been downloaded (by preload, a link hover or
 * an earlier visit) the page renders synchronously, so navigation never shows a fallback for it.
 */
export function lazyPage(factory: () => Promise<{ default: ComponentType }>): LazyPage {
  let Loaded: ComponentType | null = null;
  let promise: Promise<void> | null = null;
  const preload = () =>
    (promise ??= factory().then(
      (m) => {
        Loaded = m.default;
      },
      (err) => {
        promise = null; // allow a retry (e.g. after a network hiccup)
        throw err;
      },
    ));
  const Lazy = lazy(() => preload().then(() => ({ default: Loaded! })));

  function Page() {
    // Decided once per mount, so a page that started lazy isn't remounted when the chunk arrives.
    const [Component] = useState<ComponentType>(() => Loaded ?? Lazy);
    return <Component />;
  }
  return Object.assign(Page, { preload });
}
