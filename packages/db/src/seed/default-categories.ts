import type { NewCategory } from "../schema";

type DefaultCategory = Pick<NewCategory, "key" | "names" | "icon" | "color" | "group">;

/**
 * Default categories from PLAN.md §7. `icon` is a lucide-react icon name.
 * `key` is stable and must never change once released: clients and
 * user data refer to it.
 */
export const defaultCategories: readonly DefaultCategory[] = [
  {
    key: "rent",
    names: { ar: "الكراء", fr: "Loyer", en: "Rent" },
    icon: "house",
    color: "#6366f1",
    group: "fixed",
  },
  {
    key: "electricity",
    names: { ar: "الكهرباء (STEG)", fr: "Électricité (STEG)", en: "Electricity (STEG)" },
    icon: "zap",
    color: "#f59e0b",
    group: "fixed",
  },
  {
    key: "water",
    names: { ar: "الماء (SONEDE)", fr: "Eau (SONEDE)", en: "Water (SONEDE)" },
    icon: "droplet",
    color: "#0ea5e9",
    group: "fixed",
  },
  {
    key: "internet",
    names: { ar: "الإنترنت", fr: "Internet", en: "Internet" },
    icon: "wifi",
    color: "#8b5cf6",
    group: "fixed",
  },
  {
    key: "phone_recharge",
    names: { ar: "شحن الهاتف", fr: "Recharge téléphone", en: "Phone recharge" },
    icon: "smartphone",
    color: "#14b8a6",
    group: "fixed",
  },
  {
    key: "groceries",
    names: { ar: "المواد الغذائية", fr: "Courses", en: "Groceries" },
    icon: "shopping-basket",
    color: "#22c55e",
    group: "envelope",
  },
  {
    key: "coffee",
    names: { ar: "القهوة", fr: "Café", en: "Coffee" },
    icon: "coffee",
    color: "#92400e",
    group: "daily",
  },
  {
    key: "food_out",
    names: { ar: "الأكل خارج الدار", fr: "Repas dehors", en: "Food out" },
    icon: "utensils",
    color: "#ef4444",
    group: "daily",
  },
  {
    key: "transport",
    names: {
      ar: "النقل (لواج، حافلة، مترو، تاكسي)",
      fr: "Transport (louage, bus, métro, taxi)",
      en: "Transport (louage, bus, metro, taxi)",
    },
    icon: "bus",
    color: "#3b82f6",
    group: "daily",
  },
  {
    key: "trip_home",
    names: { ar: "السفر إلى العائلة", fr: "Retour à la maison", en: "Trip home" },
    icon: "luggage",
    color: "#0891b2",
    group: "fixed",
  },
  {
    key: "studies",
    names: {
      ar: "الدراسة (كتب، نسخ)",
      fr: "Études (livres, photocopies)",
      en: "Studies (books, photocopies)",
    },
    icon: "book-open",
    color: "#a855f7",
    group: "envelope",
  },
  {
    key: "going_out",
    names: { ar: "الخرجات", fr: "Sorties", en: "Going out" },
    icon: "party-popper",
    color: "#ec4899",
    group: "daily",
  },
  {
    key: "health",
    names: { ar: "الصحة", fr: "Santé", en: "Health" },
    icon: "heart-pulse",
    color: "#dc2626",
    group: "envelope",
  },
  {
    key: "clothes",
    names: { ar: "الملابس", fr: "Vêtements", en: "Clothes" },
    icon: "shirt",
    color: "#d946ef",
    group: "envelope",
  },
  {
    key: "other",
    names: { ar: "أخرى", fr: "Autre", en: "Other" },
    icon: "ellipsis",
    color: "#64748b",
    group: "daily",
  },
];
