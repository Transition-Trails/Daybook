/**
 * Inserts list — card grid replacing the legacy table.
 *
 * Each card: page-icon thumbnail · insert name · collection + planners meta line
 * · status + origin badges · labelled Edit and Publish/Unpublish chips.
 * No icon-only action buttons.
 */
import {
  useListInserts, useUpdateInsert, getListInsertsQueryKey,
  type Insert, type CatalogStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, Plus, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CatalogPageHeader } from "@/components/catalog/CatalogPageHeader";
import { useState } from "react";

// ── Badge primitives ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const live = status === "live";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]"
      style={live ? { background: "#ecfdf5", color: "#047857" } : { background: "#fffbeb", color: "#b45309" }}
    >
      {live ? "Live" : "Draft"}
    </span>
  );
}

function CollectionBadge({ value }: { value?: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium border border-border text-muted-foreground bg-background">
      {value}
    </span>
  );
}

function ActionChip({
  label, onClick, variant = "default", disabled, href,
}: {
  label: string;
  onClick?: () => void;
  variant?: "default" | "muted";
  disabled?: boolean;
  href?: string;
}) {
  const cls = `inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors disabled:opacity-40 cursor-pointer ${
    variant === "muted"
      ? "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-background"
      : "border-foreground/20 text-foreground bg-background hover:bg-muted"
  }`;
  if (href) {
    return <Link href={href}><span className={cls}>{label}</span></Link>;
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ cursor: disabled ? "not-allowed" : "pointer" }} className={cls}>
      {label}
    </button>
  );
}

// ── Insert card ───────────────────────────────────────────────────────────────

function InsertCard({
  insert, onToggle, togglePending,
}: {
  insert: Insert;
  onToggle: () => void;
  togglePending: boolean;
}) {
  const isLive = insert.status === "live";
  const planners = (insert.planners as string[] | null) ?? ["all"];

  return (
    <div className="rounded-[14px] border bg-card flex flex-col overflow-hidden transition-shadow hover:shadow-sm">
      {/* Thumbnail */}
      <div className="h-20 bg-muted/30 flex items-center justify-center border-b border-border shrink-0">
        <FileImage className="w-7 h-7 text-muted-foreground/40" />
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Name */}
        <p className="font-semibold text-[13.5px] text-foreground truncate">{insert.name}</p>

        {/* Meta line: collection + planner scope */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <CollectionBadge value={insert.collection} />
          <span className="text-[11.5px] text-muted-foreground">
            {planners.join(", ")}
          </span>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1.5">
          <StatusBadge status={insert.status} />
        </div>

        {/* Action chips */}
        <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1">
          <ActionChip label="Edit" href={`/catalog/inserts/${insert.id}`} variant="muted" />
          <ActionChip
            label={isLive ? "Unpublish" : "Publish"}
            onClick={onToggle}
            disabled={togglePending}
          />
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsertsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: inserts, isLoading } = useListInserts();
  const updateInsert = useUpdateInsert();
  const [togglePending, setTogglePending] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const togglePublish = (id: string, status: string) => {
    setTogglePending(id);
    const newStatus = status === "live" ? "draft" : "live";
    updateInsert.mutate({ id, data: { status: newStatus as CatalogStatus } }, {
      onSuccess: () => {
        toast({ title: "Status updated" });
        queryClient.invalidateQueries({ queryKey: getListInsertsQueryKey() });
      },
      onSettled: () => setTogglePending(null),
    });
  };

  const allInserts = (inserts as Insert[]) ?? [];
  const filtered = statusFilter === "all" ? allInserts : allInserts.filter(i => i.status === statusFilter);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CatalogPageHeader
        title="Inserts"
        subtitle="Extra pages and PDF inserts that sellers can include in any planner edition."
        primaryCta={
          <Button asChild>
            <Link href="/catalog/inserts/new">
              <Plus className="w-4 h-4 mr-2" />
              New insert
            </Link>
          </Button>
        }
        filters={[
          {
            value: statusFilter,
            options: [
              { value: "all", label: "All" },
              { value: "live", label: "Live" },
              { value: "draft", label: "Draft" },
            ],
            onChange: setStatusFilter,
          },
        ]}
        filterMeta={isLoading ? undefined : `${filtered.length} insert${filtered.length !== 1 ? "s" : ""}`}
      />

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="border border-dashed rounded-[14px] p-14 text-center text-muted-foreground">
          {statusFilter !== "all" ? `No ${statusFilter} inserts.` : "No inserts yet — create one to get started."}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
        >
          {filtered.map(insert => (
            <InsertCard
              key={insert.id}
              insert={insert}
              onToggle={() => togglePublish(insert.id, insert.status)}
              togglePending={togglePending === insert.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
