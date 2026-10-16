import {
  Building2,
  Car,
  Cog,
  Cpu,
  Droplets,
  Factory,
  Flame,
  Fuel,
  Gauge,
  HardHat,
  Leaf,
  Pill,
  Plane,
  Ship,
  Shirt,
  Truck,
  UtensilsCrossed,
  Wheat,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Icons an industry can use. The database stores the name (e.g. "Fuel"). */
export const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  Fuel,
  Shirt,
  Pill,
  Zap,
  Factory,
  Droplets,
  Flame,
  Plane,
  Ship,
  Car,
  Truck,
  Wheat,
  Leaf,
  Wind,
  Gauge,
  Cpu,
  Cog,
  HardHat,
  Building2,
  UtensilsCrossed,
};

export function industryIcon(name: string | null | undefined): LucideIcon {
  return (name && INDUSTRY_ICONS[name]) || Factory;
}
