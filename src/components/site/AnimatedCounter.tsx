import { useContext, useEffect, useRef } from "react";
import { MotionGlobalConfig, PresenceContext, useInView, useReducedMotion } from "framer-motion";

/**
 * Counts up from 0 when scrolled into view. Writes the number straight into its text node from one
 * requestAnimationFrame loop (no React re-render per frame). Shows the final value right away
 * when motion is reduced, or on a page that opened from a prerendered snapshot (no blink to 0).
 */
export function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const static_ = useContext(PresenceContext)?.initial === false || !!reduced || !!MotionGlobalConfig.skipAnimations;
  const final = `${value.toLocaleString()}${suffix}`;

  useEffect(() => {
    // Update React's own text node (not textContent), so React can still update it later.
    const el = ref.current?.firstChild;
    if (!el || static_ || !inView) return;
    const start = performance.now();
    const duration = 2000;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3; // easeOut
      el.nodeValue = `${Math.round(value * eased).toLocaleString()}${suffix}`;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.nodeValue = final;
    };
  }, [inView, static_, value, suffix, final]);

  return (
    <span ref={ref} aria-label={final}>
      {static_ ? final : `0${suffix}`}
    </span>
  );
}
