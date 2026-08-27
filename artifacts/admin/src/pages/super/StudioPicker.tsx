import { useState } from "react";
import { Link } from "wouter";
import {
  BookOpen, BookText, Box, CalendarDays, Megaphone, Palette, Sparkles, Sticker,
} from "lucide-react";
import { PageHeader, Pill } from "@/components/shared";

type Filter = "all" | "new" | "pro";
type StudioCard = {
  name: string;
  href: string;
  icon: React.ElementType;
  scale: string;
  blurb: string;
  tags: readonly string[];
  isNew?: boolean;
  pro?: boolean;
};
const STUDIOS: readonly StudioCard[] = [
  { name: "Planner", href: "/super/studios/planner", icon: CalendarDays, scale: "12 active recipes", blurb: "Build dated and undated planners from tested layouts.", tags: ["Monthly", "Weekly", "E-ink"] },
  { name: "Journal", href: "/super/studios/journal", icon: BookText, scale: "6 active recipes", blurb: "Create guided journals and reusable writing interiors.", tags: ["Prompted", "Lined"] },
  { name: "Sticker", href: "/super/studios/stickers", icon: Sticker, scale: "8 shape recipes", blurb: "Author deterministic sticker sets with production cutlines.", tags: ["Functional", "Decorative"] },
  { name: "Theme", href: "/super/studios/theme-builder", icon: Palette, scale: "4 theme bundles", blurb: "Compose palettes, backgrounds, fonts, and visual parts.", tags: ["Bundles", "Assets"] },
  { name: "Product Builder", href: "/super/studios/build", icon: Box, scale: "Recipe-driven", blurb: "Assemble a complete product from compatible catalog parts.", tags: ["Products"], pro: true },
  { name: "WorldSmith Studio", href: "/super/worldsmith", icon: BookOpen, scale: "Canon record system", blurb: "Build characters, places, timelines, and lore as linked companion volumes.", tags: ["Canon", "World bible"], isNew: true, pro: true },
  { name: "Marketing", href: "/super/studios/marketing", icon: Megaphone, scale: "3 creation tools", blurb: "Ground listing copy, social content, and mockups in a store voice.", tags: ["Listings", "Social"] },
] as const;

export default function StudioPicker() {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = STUDIOS.filter((studio) => filter === "all" || (filter === "new" ? studio.isNew : studio.pro));
  return (
    <div className="space-y-6">
      <PageHeader title="Studios" description="Choose a studio, then select a recipe inside it." />
      <div className="flex flex-wrap gap-2">
        {([
          ["all", "All studios"],
          ["new", "Has new recipes"],
          ["pro", "Pro only"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === value
                ? "border-[#1B2A4A] bg-[#1B2A4A] text-white"
                : "border-[#E7DCCB] bg-[#FFFDF9] text-[#5C4E3E] hover:bg-[#FBF6EE]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((studio) => {
          const Icon = studio.icon;
          return (
            <Link key={studio.name} href={studio.href}>
              <article className="min-h-[220px] cursor-pointer rounded-[14px] border border-[#E7DCCB] bg-[#FFFDF9] p-5 shadow-[0_1px_3px_rgba(27,42,74,.06)] transition-[box-shadow,background] duration-200 hover:bg-white hover:shadow-[0_4px_14px_rgba(27,42,74,.09)]">
                <div className="flex items-start justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F3E4DF] text-[#A85B48]">
                    <Icon className="h-4 w-4" />
                  </span>
                  {studio.isNew && <Pill tone="warn">New</Pill>}
                </div>
                <h2 className="mt-4 font-display text-[15.5px] font-semibold text-[#1B2A4A]">{studio.name}</h2>
                <p className="mt-0.5 text-xs text-[#8A7A66]">{studio.scale}</p>
                <p className="mt-4 min-h-10 text-sm leading-5 text-[#5C4E3E]">{studio.blurb}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {studio.tags.map((tag) => <Pill key={tag} tone="info">{tag}</Pill>)}
                </div>
              </article>
            </Link>
          );
        })}
      </div>
    </div>
  );
}