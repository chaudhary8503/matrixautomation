import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OrderButtons({ index, count, onMove }: { index: number; count: number; onMove: (from: number, to: number) => void }) {
  return (
    <div className="flex">
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        <ArrowUp />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
        <ArrowDown />
      </Button>
    </div>
  );
}

export function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
