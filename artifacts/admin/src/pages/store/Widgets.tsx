/**
 * Store Widgets — manage SVG overlay widgets owned by this store.
 * Widgets are functional overlays (checkboxes, habit trackers, etc.) that
 * sellers can drop into planner pages, distinct from stickers (image-based)
 * and inserts (full-page SVG pages).
 *
 * CRUD via widgetsApi (/stores/:storeId/widgets).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { widgetsApi, type Widget } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil, Shapes, Code2 } from "lucide-react";

const SIZE_VARIANTS = ["xs", "sm", "md", "lg", "xl", "2xl"];

function SvgPreview({ svgData }: { svgData: string | null }) {
  if (!svgData) {
    return (
      <div className="w-14 h-14 rounded border bg-muted flex items-center justify-center shrink-0">
        <Shapes className="w-5 h-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div
      className="w-14 h-14 rounded border bg-white flex items-center justify-center shrink-0 overflow-hidden"
      dangerouslySetInnerHTML={{ __html: svgData }}
    />
  );
}

function WidgetForm({
  storeId,
  initial,
  onSave,
  onCancel,
}: {
  storeId: string;
  initial?: Partial<Widget>;
  onSave: (data: Partial<Widget>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [svgData, setSvgData] = useState(initial?.svgData ?? "");
  const [sizeVariants, setSizeVariants] = useState<string[]>(initial?.sizeVariants ?? ["md"]);
  const [status, setStatus] = useState<"draft" | "live">(initial?.status ?? "draft");

  const toggleSize = (s: string) => {
    setSizeVariants(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Habit tracker circle" />
      </div>
      <div className="space-y-1">
        <Label className="flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5" /> SVG data
        </Label>
        <Textarea
          value={svgData}
          onChange={e => setSvgData(e.target.value)}
          placeholder="<svg xmlns=…>…</svg>"
          className="font-mono text-xs h-32"
        />
        <p className="text-xs text-muted-foreground">
          Use <code className="text-xs bg-muted px-1 rounded">{"{{slot:accent}}"}</code> placeholders for palette-driven fills.
        </p>
      </div>
      <div className="space-y-1">
        <Label>Size variants</Label>
        <div className="flex gap-1.5 flex-wrap">
          {SIZE_VARIANTS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSize(s)}
              className={`px-2.5 py-1 rounded text-xs border font-medium transition-colors ${
                sizeVariants.includes(s)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-input hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label>Status</Label>
        <Select value={status} onValueChange={(v: "draft" | "live") => setStatus(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="live">Live</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => onSave({ name, svgData: svgData || null, sizeVariants, status })} disabled={!name.trim()}>
          Save widget
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function StoreWidgets({ storeId, role }: { storeId: string; role: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: widgets = [], isLoading, error } = useQuery({
    queryKey: ["store-widgets", storeId],
    queryFn: () => widgetsApi.list(storeId),
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof widgetsApi.create>[1]) =>
      widgetsApi.create(storeId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-widgets", storeId] });
      toast({ title: "Widget created" });
      setCreateOpen(false);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof widgetsApi.patch>[2] }) =>
      widgetsApi.patch(storeId, id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-widgets", storeId] });
      toast({ title: "Widget updated" });
      setEditingId(null);
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => widgetsApi.delete(storeId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-widgets", storeId] });
      toast({ title: "Widget deleted" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const canEdit = role === "store_owner" || role === "super_admin";

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading widgets…</div>;
  if (error) return <div className="p-8 text-destructive">Failed to load widgets.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold">Widgets</h1>
          <p className="text-muted-foreground mt-1">
            SVG overlay widgets for planner pages — checkboxes, habit trackers, time-blocks, and decorative
            elements. Widgets snap into page zones and can be styled with your palette.
          </p>
        </div>
        {canEdit && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />New widget</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create widget</DialogTitle></DialogHeader>
              <WidgetForm
                storeId={storeId}
                onSave={data => createMutation.mutate(data as any)}
                onCancel={() => setCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {widgets.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center">
          <Shapes className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No widgets yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create SVG widgets to use in the Planner Studio's "Inserts & widgets" mode.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {widgets.map(widget => (
            <div key={widget.id}>
              {editingId === widget.id ? (
                <div className="border rounded-lg p-4">
                  <WidgetForm
                    storeId={storeId}
                    initial={widget}
                    onSave={data => patchMutation.mutate({ id: widget.id, data: data as any })}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="border rounded-lg px-4 py-3 flex items-center gap-4">
                  <SvgPreview svgData={widget.svgData} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{widget.name}</p>
                    <div className="flex gap-1 mt-1">
                      {(widget.sizeVariants ?? []).map(s => (
                        <span key={s} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={widget.status === "live" ? "default" : "secondary"}>{widget.status}</Badge>
                    <Badge variant="outline">{widget.origin}</Badge>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(widget.id)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => { if (confirm(`Delete "${widget.name}"?`)) deleteMutation.mutate(widget.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
