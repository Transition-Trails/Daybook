import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { helpApi, type HelpArticle } from "@/lib/api";
import { HelpArticleForm } from "@/components/help/HelpArticleForm";
import { PageHeader, StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Globe } from "lucide-react";
import { canWrite as canWriteRole } from "@/lib/permissions";

interface Props {
  storeId: string;
  role: string;
}

export default function StoreHelp({ storeId, role }: Props) {
  // Read ?draft=1&area=<area>&areaLabel=<label> set by "Draft the article" in SupportPatterns.
  const params         = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const draftParam     = params.get("draft") === "1";
  const draftAreaLabel = params.get("areaLabel") ?? params.get("area") ?? "";

  const [open, setOpen] = useState(draftParam);
  const [prefill, setPrefill] = useState<{ category: string; title: string } | null>(
    draftParam ? { category: draftAreaLabel, title: `Guide: ${draftAreaLabel}` } : null,
  );
  const [editing, setEditing] = useState<HelpArticle | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Remove draft query params once opened so re-close/re-open works normally.
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

  const canWrite = canWriteRole(role);

  const { data: articles = [], isLoading, error, refetch } = useQuery({
    queryKey: ["help/store", storeId],
    queryFn: () => helpApi.list({ scope: storeId }),
  });

  const platformArticles = articles.filter((a) => a.scope === "platform");
  const storeArticles    = articles.filter((a) => a.scope === storeId);

  const toggleMutation = useMutation({
    mutationFn: (a: HelpArticle) =>
      helpApi.update(a.id, { status: a.status === "live" ? "draft" : "live" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["help/store", storeId] }),
    onError: (err: Error) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => helpApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help/store", storeId] });
      toast({ title: "Article deleted" });
    },
    onError: (err: Error) =>
      toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  function ArticleTable({
    items,
    editable,
  }: {
    items: HelpArticle[];
    editable: boolean;
  }) {
    if (items.length === 0) {
      return <EmptyState title="No articles yet" description={editable ? "Create one above." : "No platform articles published yet."} />;
    }
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {editable && <th className="px-4 py-3 font-medium text-right">Published</th>}
              {editable && <th className="px-4 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((a) => (
              <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3 font-medium text-foreground">{a.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{a.category}</td>
                <td className="px-4 py-3"><StatusPill status={a.status} /></td>
                {editable && (
                  <td className="px-4 py-3 text-right">
                    <Switch
                      checked={a.status === "live"}
                      onCheckedChange={() => toggleMutation.mutate(a)}
                      disabled={toggleMutation.isPending}
                    />
                  </td>
                )}
                {editable && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditing(a); setOpen(true); }}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1 rounded hover:bg-red-50 transition-colors text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete article?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes "{a.title}" from your store's help.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(a.id)}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <PageHeader
        title="Help"
        description="Support articles for your store's customers."
        actions={
          canWrite && (
            <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <SheetTrigger asChild>
                <Button size="sm" style={{ background: "hsl(12 49% 58%)", color: "#fff" }}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  New article
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>{editing ? "Edit article" : "New article"}</SheetTitle>
                </SheetHeader>
                <HelpArticleForm
                  scope={storeId}
                  idPrefix="sh"
                  initial={editing ?? undefined}
                  prefill={editing ? undefined : prefill ?? undefined}
                  onDone={() => {
                    setOpen(false);
                    setEditing(null);
                    setPrefill(null);
                    qc.invalidateQueries({ queryKey: ["help/store", storeId] });
                  }}
                />
              </SheetContent>
            </Sheet>
          )
        }
      />

      {isLoading ? (
        <SkeletonRows rows={5} cols={4} />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <>
          {/* Store articles */}
          <section>
            <h2 className="font-display font-semibold text-sm mb-3 text-foreground">
              Your store articles
              <span className="ml-2 text-xs text-muted-foreground font-sans font-normal">
                ({storeArticles.length})
              </span>
            </h2>
            <ArticleTable items={storeArticles} editable={canWrite} />
          </section>

          {/* Platform articles (read-only) */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display font-semibold text-sm text-foreground">
                Platform articles
                <span className="ml-2 text-xs text-muted-foreground font-sans font-normal">
                  ({platformArticles.filter((a) => a.status === "live").length} live)
                </span>
              </h2>
              <span className="text-xs text-muted-foreground">— read only</span>
            </div>
            <ArticleTable items={platformArticles.filter((a) => a.status === "live")} editable={false} />
          </section>
        </>
      )}
    </div>
  );
}
