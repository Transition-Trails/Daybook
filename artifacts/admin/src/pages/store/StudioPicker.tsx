import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity,
  BookCopy,
  BookOpen,
  Box,
  CalendarDays,
  Megaphone,
  Palette,
  Sticker,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/shared";
import { flagsQueryOptions } from "@/lib/api";
import { isSuperAdminRole } from "@/lib/permissions";

interface Props {
  storeId: string;
  role: string;
}

type StudioCard = {
  name: string;
  href: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
};

export default function StoreStudioPicker({ storeId, role }: Props) {
  const { data: flags, isLoading } = useQuery(flagsQueryOptions(storeId));
  const isSuperAdmin = isSuperAdminRole(role);
  const aiEnabled = isSuperAdmin || flags?.aiEnabled === true;
  const worldsmithEnabled = isSuperAdmin || flags?.worldsmithEnabled === true;
  const base = `/store/${storeId}`;

  const studios: StudioCard[] = [
    {
      name: "Product Builder",
      href: `${base}/build`,
      description: "Assemble a complete product from compatible catalog parts.",
      icon: Box,
      enabled: aiEnabled,
    },
    {
      name: "Planner Studio",
      href: `${base}/studios/planners`,
      description: "Build planner interiors, inserts, themes, and production-ready files.",
      icon: CalendarDays,
      enabled: aiEnabled,
    },
    {
      name: "Edition Studio",
      href: `${base}/studios/edition`,
      description: "Create and maintain the editions sold through your store.",
      icon: BookCopy,
      enabled: aiEnabled,
    },
    {
      name: "Sticker Studio",
      href: `${base}/studios/stickers`,
      description: "Create stickers, use shape recipes, and assemble complete packs.",
      icon: Sticker,
      enabled: aiEnabled,
    },
    {
      name: "Theme Studio",
      href: `${base}/studios/theme`,
      description: "Generate cohesive palettes and themes grounded in your store.",
      icon: Palette,
      enabled: aiEnabled,
    },
    {
      name: "Trend Research",
      href: `${base}/studios/trends`,
      description: "Turn a research brief into product directions and studio handoffs.",
      icon: Activity,
      enabled: aiEnabled,
    },
    {
      name: "Marketing Studio",
      href: `${base}/studios/marketing`,
      description: "Create grounded listing copy, social content, and mockup concepts.",
      icon: Megaphone,
      enabled: aiEnabled,
    },
    {
      name: "WorldSmith Studio",
      href: `${base}/worldsmith`,
      description: "Develop connected worlds, stories, and canon records.",
      icon: BookOpen,
      enabled: worldsmithEnabled,
    },
  ];
  const visibleStudios = studios.filter((studio) => studio.enabled);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Studios"
        description="Choose an enabled studio, then select a recipe or workflow inside it."
      />

      {isLoading && !isSuperAdmin ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading studios">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-[14px] border border-[#E7DCCB] bg-[#FFFDF9]" />
          ))}
        </div>
      ) : visibleStudios.length === 0 ? (
        <div className="rounded-[14px] border border-[#E7DCCB] bg-[#FFFDF9]">
          <EmptyState
            title="No studios enabled"
            description="A platform administrator can enable studios for this store."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleStudios.map((studio) => {
            const Icon = studio.icon;
            return (
              <Link
                key={studio.name}
                href={studio.href}
                className="group rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2A4A] focus-visible:ring-offset-2"
              >
                <article className="h-full min-h-48 rounded-[14px] border border-[#E7DCCB] bg-[#FFFDF9] p-5 shadow-[0_1px_3px_rgba(27,42,74,.06)] transition-[box-shadow,background,border-color] group-hover:border-[#D9C8B1] group-hover:bg-white group-hover:shadow-[0_4px_14px_rgba(27,42,74,.09)]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F3E4DF] text-[#A85B48]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 className="mt-5 font-display text-base font-semibold text-[#1B2A4A]">{studio.name}</h2>
                  <p className="mt-2 text-sm leading-5 text-[#5C4E3E]">{studio.description}</p>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}