import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  useListEditions, 
  type Edition,
} from '@workspace/api-client-react';
import { plannerInteriorsApi, storesApi, type Store } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Plus, Pin, Eye, Database, FileJson, Clock, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Schemas
// ============================================================================

const manifestSchema = z.object({
  trim: z.object({
    w: z.number(),
    h: z.number(),
    unit: z.literal("mm"),
  }),
  pages: z.array(
    z.object({
      template: z.string(),
      once: z.literal(true).optional(),
      repeat: z.object({
        over: z.enum(["months", "days"]),
        from: z.string(),
        to: z.string(),
      }).optional(),
    })
  ),
});

const jsonStringSchema = z.string().refine(
  (val) => {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Must be a valid JSON string" }
);

const createInteriorSchema = z.object({
  storeId: z.string().min(1, "Store ID is required"),
  name: z.string().min(1, "Name is required"),
  manifest: jsonStringSchema,
  assets: jsonStringSchema,
});

const createVersionSchema = z.object({
  manifest: jsonStringSchema,
  assets: jsonStringSchema,
});

const DEFAULT_MANIFEST = JSON.stringify({
  trim: { w: 210, h: 297, unit: "mm" },
  pages: [
    { template: "cover", once: true },
    { template: "monthly", repeat: { over: "months", from: "2027-01", to: "2027-12" } }
  ]
}, null, 2);

const DEFAULT_ASSETS = JSON.stringify({
  "cover": "<svg viewBox=\"0 0 210 297\"><rect x=\"0\" y=\"0\" width=\"210\" height=\"297\" fill=\"#F8F6F1\"/><text id=\"slot:text:year\" x=\"24\" y=\"145\" font-size=\"28\" fill=\"#1B2A4A\">2027</text></svg>",
  "monthly": "<svg viewBox=\"0 0 210 297\"><rect x=\"15\" y=\"18\" width=\"180\" height=\"1\" fill=\"#C87560\"/><text id=\"slot:text:month\" x=\"20\" y=\"42\" font-size=\"18\" fill=\"#1B2A4A\">Month</text></svg>"
}, null, 2);

// ============================================================================
// Main Page Component
// ============================================================================

export default function PlannerInteriorsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const { data: interiors = [], isLoading } = useQuery({
    queryKey: ['planner-interiors'],
    queryFn: plannerInteriorsApi.list,
  });

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="px-6 py-4 border-b bg-card flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Planner Interiors</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage core SVG interior templates and versions for Daybook planners.</p>
        </div>
        <CreateInteriorDialog />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: List */}
        <div className="w-[320px] shrink-0 border-r bg-muted/10 overflow-y-auto p-4 flex flex-col gap-2">
          {isLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
            </div>
          ) : interiors.length === 0 ? (
            <div className="text-center p-8 border border-dashed rounded-lg bg-card text-muted-foreground text-sm">
              No interiors found.
            </div>
          ) : (
            interiors.map(int => (
              <button
                key={int.id}
                onClick={() => setSelectedId(int.id)}
                className={cn(
                  "text-left p-3 rounded-lg border transition-all duration-200 hover:border-primary/40",
                  selectedId === int.id 
                    ? "bg-primary/5 border-primary/50 ring-1 ring-primary/20 shadow-sm" 
                    : "bg-card border-border hover:shadow-sm"
                )}
              >
                <div className="font-medium text-sm text-foreground">{int.name}</div>
                <div className="text-xs text-muted-foreground mt-1.5 flex items-center justify-between">
                  <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{int.id.split('-')[0]}</span>
                  {int.currentVersionId ? (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-normal">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal text-muted-foreground border-dashed">Draft</Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Right Panel: Detail */}
        <div className="flex-1 bg-background overflow-y-auto">
          {selectedId ? (
            <InteriorDetail id={selectedId} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
              <Database className="w-12 h-12 mb-4 opacity-20" />
              <p>Select an interior to view versions and details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Detail Panel
// ============================================================================

function InteriorDetail({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['planner-interiors', id],
    queryFn: () => plannerInteriorsApi.get(id),
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading interior details...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex items-center justify-center text-destructive">
        Failed to load interior details.
      </div>
    );
  }

  const { interior, versions } = data;
  // Sort versions descending (assuming newer versions have higher version number)
  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-display font-semibold tracking-tight">{interior.name}</h2>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
            <span className="font-mono bg-muted/50 px-2 py-0.5 rounded border">ID: {interior.id}</span>
            <span>&bull;</span>
            <span className="font-mono bg-muted/50 px-2 py-0.5 rounded border">Store: {interior.storeId}</span>
          </div>
        </div>
        <CreateVersionDialog interiorId={interior.id} interiorName={interior.name} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b pb-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <h3 className="text-lg font-medium">Version History</h3>
          <Badge variant="secondary" className="ml-2 font-normal text-xs">{versions.length} Total</Badge>
        </div>

        {sortedVersions.length === 0 ? (
          <div className="text-center p-12 border border-dashed rounded-xl bg-muted/10 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No versions exist yet. Create the first version to define the template.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedVersions.map(v => (
              <Card 
                key={v.id} 
                className={cn(
                  "overflow-hidden transition-all duration-200 hover:shadow-md",
                  interior.currentVersionId === v.id 
                    ? "border-primary/40 ring-1 ring-primary/10 shadow-sm" 
                    : ""
                )}
              >
                <div className={cn(
                  "px-5 py-4 border-b flex items-center justify-between",
                  interior.currentVersionId === v.id ? "bg-primary/5" : "bg-muted/20"
                )}>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">Version {v.version}</span>
                        {interior.currentVersionId === v.id && (
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 text-[10px] uppercase font-bold tracking-wider">
                            Active PIN
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono mt-1">ID: {v.id}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant="secondary" 
                      className="h-8 gap-2 bg-background shadow-sm hover:bg-muted"
                      onClick={() => window.open(plannerInteriorsApi.previewUrl(interior.id, v.id), "_blank")}
                    >
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      Preview PDF
                    </Button>
                    <PinEditionDialog interiorId={interior.id} versionId={v.id} />
                  </div>
                </div>
                
                <CardContent className="p-0 grid grid-cols-2 divide-x bg-card">
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      <FileJson className="w-3.5 h-3.5" />
                      Manifest
                    </div>
                    <div className="bg-muted/30 border rounded-md p-3 max-h-[300px] overflow-auto">
                      <pre className="text-[11px] leading-relaxed font-mono text-foreground/80">
                        {JSON.stringify(v.manifest, null, 2)}
                      </pre>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      <FileJson className="w-3.5 h-3.5" />
                      Assets
                    </div>
                    <div className="bg-muted/30 border rounded-md p-3 max-h-[300px] overflow-auto">
                      <pre className="text-[11px] leading-relaxed font-mono text-foreground/80">
                        {JSON.stringify(v.assets, null, 2)}
                      </pre>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Dialogs
// ============================================================================

function CreateInteriorDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stores = [] } = useQuery({
    queryKey: ["stores"],
    queryFn: () => storesApi.list(),
  });

  const form = useForm<z.infer<typeof createInteriorSchema>>({
    resolver: zodResolver(createInteriorSchema),
    defaultValues: {
      storeId: "",
      name: "",
      manifest: DEFAULT_MANIFEST,
      assets: DEFAULT_ASSETS,
    },
  });

  const createMut = useMutation({
    mutationFn: async (values: z.infer<typeof createInteriorSchema>) => {
      // Validate manifest parses correctly to the specific schema
      const manifestObj = JSON.parse(values.manifest);
      manifestSchema.parse(manifestObj); // Will throw if invalid shape

      return plannerInteriorsApi.create({
        storeId: values.storeId,
        name: values.name,
        manifest: manifestObj,
        assets: JSON.parse(values.assets),
      });
    },
    onSuccess: () => {
      toast({ title: "Interior created successfully" });
      queryClient.invalidateQueries({ queryKey: ['planner-interiors'] });
      setOpen(false);
      form.reset();
    },
    onError: (err: any) => {
      toast({ 
        title: "Creation failed", 
        description: err.message || "Invalid JSON or server error", 
        variant: "destructive" 
      });
    }
  });

  const onSubmit = (values: z.infer<typeof createInteriorSchema>) => {
    createMut.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shadow-sm hover:shadow">
          <Plus className="w-4 h-4 mr-2" /> New Interior
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Planner Interior</DialogTitle>
          <DialogDescription>
            Defines a new core interior for a store. This will generate version 1 automatically.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="storeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select store..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stores.map((s: Store) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Minimalist Daily" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="manifest"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manifest (JSON)</FormLabel>
                    <FormControl>
                      <Textarea 
                        className="font-mono text-xs h-[240px] bg-muted/30" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assets"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assets (JSON)</FormLabel>
                    <FormControl>
                      <Textarea 
                        className="font-mono text-xs h-[240px] bg-muted/30" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "Create Interior"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function CreateVersionDialog({ interiorId, interiorName }: { interiorId: string, interiorName: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof createVersionSchema>>({
    resolver: zodResolver(createVersionSchema),
    defaultValues: {
      manifest: DEFAULT_MANIFEST,
      assets: DEFAULT_ASSETS,
    },
  });

  const createMut = useMutation({
    mutationFn: async (values: z.infer<typeof createVersionSchema>) => {
      const manifestObj = JSON.parse(values.manifest);
      manifestSchema.parse(manifestObj);

      return plannerInteriorsApi.createVersion(interiorId, {
        manifest: manifestObj,
        assets: JSON.parse(values.assets),
      });
    },
    onSuccess: () => {
      toast({ title: "Version created successfully" });
      queryClient.invalidateQueries({ queryKey: ['planner-interiors', interiorId] });
      queryClient.invalidateQueries({ queryKey: ['planner-interiors'] });
      setOpen(false);
      form.reset();
    },
    onError: (err: any) => {
      toast({ 
        title: "Version creation failed", 
        description: err.message || "Invalid JSON or server error", 
        variant: "destructive" 
      });
    }
  });

  const onSubmit = (values: z.infer<typeof createVersionSchema>) => {
    createMut.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> New Version
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Version</DialogTitle>
          <DialogDescription>
            Appending a new version to <strong>{interiorName}</strong>. 
            Existing versions and active pins are not affected.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="manifest"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manifest (JSON)</FormLabel>
                    <FormControl>
                      <Textarea 
                        className="font-mono text-xs h-[300px] bg-muted/30" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assets"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assets (JSON)</FormLabel>
                    <FormControl>
                      <Textarea 
                        className="font-mono text-xs h-[300px] bg-muted/30" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "Publish Version"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function PinEditionDialog({ interiorId, versionId }: { interiorId: string, versionId: string }) {
  const [open, setOpen] = useState(false);
  const [editionId, setEditionId] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: editions = [], isLoading } = useListEditions();

  const pinMut = useMutation({
    mutationFn: () => plannerInteriorsApi.pinEdition(editionId, versionId),
    onSuccess: () => {
      toast({ title: "Pinned successfully" });
      queryClient.invalidateQueries({ queryKey: ['planner-interiors', interiorId] });
      queryClient.invalidateQueries({ queryKey: ['planner-interiors'] });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ 
        title: "Failed to pin", 
        description: err.message || "Server error", 
        variant: "destructive" 
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-2 bg-background shadow-sm hover:bg-muted">
          <Pin className="w-3.5 h-3.5 text-muted-foreground" />
          Pin to Edition
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pin Version to Edition</DialogTitle>
          <DialogDescription>
            Attach this interior version to a specific catalog edition. The edition will use this exact interior configuration.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label>Target Edition</Label>
            <Select value={editionId} onValueChange={setEditionId} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Loading editions..." : "Choose an edition..."} />
              </SelectTrigger>
              <SelectContent>
                {(editions as Edition[]).map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!editionId || pinMut.isPending} onClick={() => pinMut.mutate()}>
            {pinMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Pinning...</> : "Confirm Pin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
