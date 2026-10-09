import type { NewCategory } from "../schema";

type DefaultCategory = Pick<NewCategory, "key" | "names" | "icon" | "color" | "group">;

/**
 * Default categories from PLAN.md §7. `icon` is a lucide-react icon name.
 * The order is `position`: fixed costs first, then what quick log offers a
 * new student, most frequent first (coffee, transport, food out), "other" last.
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
    names: { ar: "الضو (الستاغ)", fr: "Électricité (STEG)", en: "Electricity (STEG)" },
    icon: "zap",
    color: "#f59e0b",
    group: "fixed",
  },
  {
    key: "water",
    names: { ar: "الماء (الصوناد)", fr: "Eau (SONEDE)", en: "Water (SONEDE)" },
    icon: "droplet",
    color: "#0ea5e9",
    group: "fixed",
  },
  {
    key: "internet",
    names: { ar: "الأنترنات", fr: "Internet", en: "Internet" },
    icon: "wifi",
    color: "#8b5cf6",
    group: "fixed",
  },
  {
    key: "phone_recharge",
    names: { ar: "شحن التليفون", fr: "Recharge téléphone", en: "Phone recharge" },
    icon: "smartphone",
    color: "#14b8a6",
    group: "fixed",
  },
  {
    key: "trip_home",
    names: { ar: "مرواحة للدار", fr: "Retour à la maison", en: "Trip home" },
    icon: "luggage",
    color: "#0891b2",
    group: "fixed",
  },
  {
    key: "coffee",
    names: { ar: "القهوة", fr: "Café", en: "Coffee" },
    icon: "coffee",
    color: "#92400e",
    group: "daily",
  },
  {
    key: "transport",
    names: {
      ar: "التنقل (لواج، كار، مترو، تاكسي)",
      fr: "Transport (louage, bus, métro, taxi)",
      en: "Transport (louage, bus, metro, taxi)",
    },
    icon: "bus",
    color: "#3b82f6",
    group: "daily",
  },
  {
    key: "food_out",
    names: { ar: "ماكلة برّا", fr: "Repas dehors", en: "Food out" },
    icon: "utensils",
    color: "#ef4444",
    group: "daily",
  },
  {
    key: "going_out",
    names: { ar: "الخرجات", fr: "Sorties", en: "Going out" },
    icon: "party-popper",
    color: "#ec4899",
    group: "daily",
  },
  {
    key: "groceries",
    names: { ar: "القضية", fr: "Courses", en: "Groceries" },
    icon: "shopping-basket",
    color: "#22c55e",
    group: "envelope",
  },
  {
    key: "studies",
    names: {
      ar: "القراية (كتب، فوتوكوبي)",
      fr: "Études (livres, photocopies)",
      en: "Studies (books, photocopies)",
    },
    icon: "book-open",
    color: "#a855f7",
    group: "envelope",
  },
  {
    key: "health",
    names: { ar: "الصحة والدواء", fr: "Santé", en: "Health" },
    icon: "heart-pulse",
    color: "#dc2626",
    group: "envelope",
  },
  {
    key: "clothes",
    names: { ar: "الحوايج", fr: "Vêtements", en: "Clothes" },
    icon: "shirt",
    color: "#d946ef",
    group: "envelope",
  },
  {
    key: "other",
    names: { ar: "حاجات أخرى", fr: "Autre", en: "Other" },
    icon: "ellipsis",
    color: "#64748b",
    group: "daily",
  },
];
