import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { helpApi, type HelpArticle } from "@/lib/api";
import { HelpArticleForm } from "@/components/help/HelpArticleForm";
import { PageHeader, StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Search, ChevronRight } from "lucide-react";
import { helpCategoryLabel, isHelpCategory } from "@workspace/api-zod";

type Kind = "article" | "faq";

export default function SuperHelpCenter() {
  // SupportPatterns supplies the canonical support-area key in ?area=.
  // Set when arriving via "Draft the article" from SupportPatterns.
  const params       = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const draftParam   = params.get("draft") === "1";
  const draftArea    = params.get("area") ?? "";

  const [kind, setKind] = useState<Kind>("article");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "draft">("all");
  const [open, setOpen] = useState(draftParam);
  const [prefill, setPrefill] = useState<{ category: string; title: string } | null>(
    draftParam && isHelpCategory(draftArea)
      ? { category: draftArea, title: `Guide: ${helpCategoryLabel(draftArea)}` }
      : null,
  );
  const [editing, setEditing] = useState<HelpArticle | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Clear the draft URL params once the drawer has been opened so a manual
  // close and re-open doesn't keep forcing it back open.
  useEffect(() => {
    if (draftParam && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("draft");
      url.searchParams.delete("area");
      url.searchParams.delete("areaLabel");
      window.history.replaceState({}, "", url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: articles = [], isLoading, error, refetch } = useQuery({
    queryKey: ["help/platform"],
    queryFn: () => helpApi.list({ scope: "platform" }),
  });

  const matchesActiveFilters = (article: HelpArticle) =>
    (statusFilter === "all" || article.status === statusFilter)
    && article.title.toLowerCase().includes(search.toLowerCase());
  const filteredCounts = {
    article: articles.filter((article) => article.kind === "article" && matchesActiveFilters(article)).length,
    faq: articles.filter((article) => article.kind === "faq" && matchesActiveFilters(article)).length,
  };
  const byKind = articles.filter((article) => article.kind === kind && matchesActiveFilters(article));

  const toggleMutation = useMutation({
    mutationFn: (a: HelpArticle) =>
      helpApi.update(a.id, { status: a.status === "live" ? "draft" : "live" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["help/platform"] }),
    onError: (err: Error) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => helpApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help/platform"] });
      toast({ title: "Article deleted" });
    },
    onError: (err: Error) =>
      toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Help center"
        description="Platform-wide articles and FAQs visible to all users."
        scopeLabel="Platform"
        actions={
          <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <SheetTrigger asChild>
              <Button size="sm" style={{ background: "hsl(12 49% 58%)", color: "#fff" }}>
                <Plus className="w-4 h-4 mr-1.5" />
                New article
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{editing ? "Edit article" : "New article"}</SheetTitle>
              </SheetHeader>
              <HelpArticleForm
                scope="platform"
                idPrefix="h"
                initial={editing ?? undefined}
                prefill={editing ? undefined : prefill ?? undefined}
                onDone={() => {
                  setOpen(false);
                  setEditing(null);
                  setPrefill(null);
                  qc.invalidateQueries({ queryKey: ["help/platform"] });
                }}
              />
            </SheetContent>
          </Sheet>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["article", "faq"] as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize"
            style={
              kind === k
                ? { borderColor: "hsl(12 49% 58%)", color: "hsl(12 49% 48%)" }
                : { borderColor: "transparent", color: "hsl(216 15% 50%)" }
            }
          >
            {k === "article" ? "Articles" : "FAQs"}
            <span className="ml-1.5 text-xs opacity-60">
              {filteredCounts[k]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8A7A66]" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search articles" className="border-[#E7DCCB] bg-[#FFFDF9] pl-9" />
        </label>
        {(["all", "live", "draft"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${statusFilter === value ? "border-[#1B2A4A] bg-[#1B2A4A] text-white" : "border-[#E7DCCB] bg-[#FFFDF9] text-[#5C4E3E]"}`}>
            {value}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-[#8A7A66]">{byKind.length} shown · {articles.filter((article) => article.kind === kind).length} total</span>
      </div>

      {isLoading ? (
        <SkeletonRows rows={5} cols={4} />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : byKind.length === 0 ? (
        <EmptyState title={`No ${kind}s yet`} description="Create one with the button above." />
      ) : (
        <div className="rounded-[14px] border border-[#E7DCCB] bg-[#FFFDF9] overflow-hidden">
          <div className="grid grid-cols-[2.4fr_1fr_.9fr_68px] gap-3 border-b border-[#EFE6D8] bg-[#FBF6EE] px-[18px] py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#8A7A66]">
            <span>Article</span><span>Collection</span><span>Status</span><span />
          </div>
          <div className="divide-y divide-[#F2EAE0]">
              {byKind.map((a) => (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setEditing(a); setOpen(true); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setEditing(a);
                      setOpen(true);
                    }
                  }}
                  aria-label={`Edit ${a.title}`}
                  className="grid cursor-pointer grid-cols-[2.4fr_1fr_.9fr_68px] items-center gap-3 px-[18px] py-3 transition-colors hover:bg-[#FBF6EE] focus-visible:bg-[#FBF6EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B2A4A]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#1B2A4A]">{a.title}</p>
                    <p className="text-[10px] text-[#8A7A66]">Updated {new Date(a.updatedAt).toLocaleDateString()}</p>
                  </div>
                  <span className="truncate text-sm text-[#5C4E3E]">{helpCategoryLabel(a.category as any)}</span>
                   <button
                     type="button"
                     onClick={(event) => {
                       event.stopPropagation();
                       toggleMutation.mutate(a);
                     }}
                     onKeyDown={(event) => event.stopPropagation()}
                     disabled={toggleMutation.isPending}
                     className="justify-self-start"
                     aria-label={`${a.status === "live" ? "Unpublish" : "Publish"} ${a.title}`}
                   >
                     <StatusPill status={a.status} />
                   </button>
                  <div className="flex items-center justify-end gap-1">
                     <button onClick={(event) => { event.stopPropagation(); setEditing(a); setOpen(true); }} className="p-1 text-[#A2937E] hover:text-[#1B2A4A]" title={`Edit ${a.title}`} aria-label={`Edit ${a.title}`}>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                         <button onClick={(event) => event.stopPropagation()} className="rounded p-1 text-[#A2937E] transition-colors hover:bg-red-50 hover:text-destructive" aria-label={`Delete ${a.title}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete article?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently remove "{a.title}" from the help center.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(a.id)} className="bg-destructive text-white hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
