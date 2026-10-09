import {
  BookOpenIcon,
  BusIcon,
  CircleIcon,
  CoffeeIcon,
  DropletIcon,
  EllipsisIcon,
  HeartPulseIcon,
  HouseIcon,
  type LucideIcon,
  LuggageIcon,
  PartyPopperIcon,
  ShirtIcon,
  ShoppingBasketIcon,
  SmartphoneIcon,
  UtensilsIcon,
  WifiIcon,
  ZapIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

// Categories store a lucide icon name (packages/db seed). Only these are
// bundled; anything else shows a plain circle.
const icons: Record<string, LucideIcon> = {
  "book-open": BookOpenIcon,
  bus: BusIcon,
  coffee: CoffeeIcon,
  droplet: DropletIcon,
  ellipsis: EllipsisIcon,
  "heart-pulse": HeartPulseIcon,
  house: HouseIcon,
  luggage: LuggageIcon,
  "party-popper": PartyPopperIcon,
  shirt: ShirtIcon,
  "shopping-basket": ShoppingBasketIcon,
  smartphone: SmartphoneIcon,
  utensils: UtensilsIcon,
  wifi: WifiIcon,
  zap: ZapIcon,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = icons[name] ?? CircleIcon;
  return <Icon className={cn("size-5", className)} aria-hidden />;
}
