import { useListPlans, useCreatePlan, useUpdatePlan, useDeletePlan, getListPlansQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Edit2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const planSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  tier: z.enum(['basic', 'advanced']),
  oneTimePrice: z.coerce.number().optional(),
  yearlyPrice: z.coerce.number().optional(),
  lifetimePrice: z.coerce.number().optional(),
});

export default function PlansList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: plans, isLoading } = useListPlans();
  
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<z.infer<typeof planSchema>>({
    resolver: zodResolver(planSchema),
    defaultValues: { name: '', description: '', tier: 'basic', oneTimePrice: 0, yearlyPrice: 0, lifetimePrice: 0 }
  });

  const openNew = () => {
    setEditingId(null);
    form.reset({ name: '', description: '', tier: 'basic', oneTimePrice: 0, yearlyPrice: 0, lifetimePrice: 0 });
    setIsModalOpen(true);
  };

  const openEdit = (plan: any) => {
    setEditingId(plan.id);
    form.reset({
      name: plan.name,
      description: plan.description || '',
      tier: plan.tier,
      oneTimePrice: plan.oneTimePrice ? plan.oneTimePrice / 100 : 0,
      yearlyPrice: plan.yearlyPrice ? plan.yearlyPrice / 100 : 0,
      lifetimePrice: plan.lifetimePrice ? plan.lifetimePrice / 100 : 0,
    });
    setIsModalOpen(true);
  };

  const onSubmit = (data: z.infer<typeof planSchema>) => {
    const payload = {
      ...data,
      oneTimePrice: data.oneTimePrice ? Math.round(data.oneTimePrice * 100) : undefined,
      yearlyPrice: data.yearlyPrice ? Math.round(data.yearlyPrice * 100) : undefined,
      lifetimePrice: data.lifetimePrice ? Math.round(data.lifetimePrice * 100) : undefined,
    };

    const action = editingId ? updatePlan.mutateAsync({ id: editingId, data: payload }) : createPlan.mutateAsync({ data: payload });

    action.then(() => {
      toast({ title: `Plan ${editingId ? 'updated' : 'created'}` });
      queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
      setIsModalOpen(false);
    }).catch(err => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    });
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this plan?')) {
      deletePlan.mutate({ id }, {
        onSuccess: () => {
          toast({ title: 'Plan deleted' });
          queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
        }
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Plans</h1>
          <p className="text-muted-foreground mt-1">Manage subscription plans and tier access.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            New Plan
          </Button>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Plan' : 'New Plan'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="tier" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tier</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="oneTimePrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>One-Time</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="yearlyPrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Yearly</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lifetimePrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lifetime</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createPlan.isPending || updatePlan.isPending}>
                  {(createPlan.isPending || updatePlan.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : plans?.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground">No plans found.</div>
        ) : (
          plans?.map(plan => (
            <Card key={plan.id} className="relative overflow-hidden flex flex-col group">
              {plan.tier === 'advanced' && (
                <div className="absolute top-0 right-0 p-4">
                  <Badge className="bg-primary hover:bg-primary">Advanced</Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{plan.description || 'No description'}</p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">One-time</span>
                    <span className="font-mono">{plan.oneTimePrice ? `$${(plan.oneTimePrice/100).toFixed(2)}` : '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Yearly</span>
                    <span className="font-mono">{plan.yearlyPrice ? `$${(plan.yearlyPrice/100).toFixed(2)}` : '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Lifetime</span>
                    <span className="font-mono">{plan.lifetimePrice ? `$${(plan.lifetimePrice/100).toFixed(2)}` : '-'}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => openEdit(plan)}>
                    <Edit2 className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(plan.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}