import type { Variants } from "framer-motion";

/**
 * Staggered entrance for a list. With `count`, the delay between items shrinks so the whole list
 * has appeared within ~0.5 s, however many items there are.
 */
export const stagger = (step = 0.08, count?: number): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: count ? Math.min(step, 0.5 / count) : step } },
});

// Entrance variants animate only opacity and transform (cheap, composited).
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 25 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};
