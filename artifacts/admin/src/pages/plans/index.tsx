import { useListPlans } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Crown } from 'lucide-react';

export default function PlansList() {
  const { data: plans, isLoading } = useListPlans();

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Plans</h1>
          <p className="text-muted-foreground mt-1">Subscription plans are defined at the seed level and cannot be modified here.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {(plans as any[])?.map(plan => (
          <Card key={plan.id} className="relative overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <CardTitle className="capitalize">{plan.name}</CardTitle>
                </div>
                <Badge variant="outline" className="font-mono text-xs">{plan.id}</Badge>
              </div>
              {plan.description && (
                <CardDescription>{plan.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                {plan.oneTimePrice != null && (
                  <div className="bg-muted/50 rounded-md p-3 text-center">
                    <div className="text-2xl font-bold font-mono">${plan.oneTimePrice.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground mt-1">One-time</div>
                  </div>
                )}
                {plan.yearlyPrice != null && (
                  <div className="bg-muted/50 rounded-md p-3 text-center">
                    <div className="text-2xl font-bold font-mono">${plan.yearlyPrice.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground mt-1">Yearly</div>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center pt-2">
                Plans are seeded constants — create or delete via the database seed script.
              </p>
            </CardContent>
          </Card>
        ))}

        {!isLoading && (plans as any[])?.length === 0 && (
          <Card className="col-span-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Crown className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No plans found. Run the seed script to populate plans.</p>
              <p className="text-xs text-muted-foreground mt-2 font-mono">pnpm --filter @workspace/scripts run seed</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
