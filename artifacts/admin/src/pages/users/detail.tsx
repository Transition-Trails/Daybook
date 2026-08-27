import { useParams, Link } from 'wouter';
import { useGetUser, getGetUserQueryKey } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { billingApi, type CustomerPaymentHistoryEntry } from '@/lib/api';
import { EmptyState, ErrorState } from '@/components/shared';
import { Loader2, ArrowLeft, CreditCard, ExternalLink } from 'lucide-react';

function formatMoney(amountCents: number | null, currency: string | null): string {
  if (amountCents === null) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: (currency ?? 'usd').toUpperCase(),
  }).format(amountCents / 100);
}

function lifecycleLabel(payment: CustomerPaymentHistoryEntry): string {
  if (payment.lifecycleEvent.type === 'charge.refunded') return 'Refunded';
  if (payment.lifecycleEvent.type === 'customer.subscription.deleted') return 'Cancelled';
  if (payment.lifecycleEvent.type === 'invoice.payment_failed') return 'Payment failed';
  return payment.lifecycleEvent.type ?? '';
}

export default function UserDetail() {
  const params = useParams();
  const id = params.id!;

  const { data: userData, isLoading } = useGetUser(id as any, { query: { enabled: !!id, queryKey: getGetUserQueryKey(id as any) } });
  const user = userData as any;
  const {
    data: paymentData,
    isLoading: paymentsLoading,
    error: paymentsError,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: ['customer-payment-history', id],
    queryFn: () => billingApi.customerPayments(id),
    enabled: !!id && !!user,
  });

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!user) return <div className="text-center py-12">User not found.</div>;

  const owned: string[] = user.owned || [];
  const ownedEditions = owned.filter((id: string) => id.startsWith('e-') || id.startsWith('e'));
  const ownedThemes = owned.filter((id: string) => id.startsWith('t-') || id.startsWith('t'));
  const ownedPacks = owned.filter((id: string) => id.startsWith('p-') || id.startsWith('p'));
  const ownedInserts = owned.filter((id: string) => id.startsWith('i-') || id.startsWith('i'));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/super/users"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full border shadow-sm" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/20 text-lg font-bold">
              {user.name?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">{user.name}</h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Platform access</span>
              <Badge variant="outline" className="capitalize">
                {user.platformRole === 'super_admin' ? 'Super admin' : 'Store access via membership'}
              </Badge>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Joined</span>
              <span className="font-mono">{new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-mono capitalize">{user.plan || 'Free'}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">AI Enabled</span>
              <Badge variant={user.aiEnabled ? 'default' : 'secondary'}>{user.aiEnabled ? 'Yes' : 'No'}</Badge>
            </div>
            <div className="flex justify-between pb-2">
              <span className="text-muted-foreground">AI Provider</span>
              <span className="font-mono capitalize">{user.aiProvider || 'claude'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Owned Assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">All Owned</span>
              <Badge>{owned.length}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Editions</span>
              <Badge>{ownedEditions.length}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Themes</span>
              <Badge>{ownedThemes.length}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Packs</span>
              <Badge>{ownedPacks.length}</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
              <span className="text-sm">Inserts</span>
              <Badge>{ownedInserts.length}</Badge>
            </div>
            {owned.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {owned.map((itemId: string) => (
                  <Badge key={itemId} variant="outline" className="text-xs font-mono">{itemId}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              Subscription payment history
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Every Stripe payment recorded for this customer, including lifecycle changes.
            </p>
          </div>
          {paymentData && (
            <Badge variant="outline">
              {paymentData.payments.length} {paymentData.payments.length === 1 ? 'payment' : 'payments'}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading payment history…
            </div>
          ) : paymentsError ? (
            <ErrorState
              message="Couldn’t load this customer’s payment history."
              onRetry={() => refetchPayments()}
            />
          ) : !paymentData?.payments.length ? (
            <EmptyState
              icon={CreditCard}
              title="No subscription payments"
              description="Payments recorded by Stripe will appear here."
            />
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-2 py-3 font-medium">Order / date</th>
                    <th className="px-2 py-3 font-medium">Plan</th>
                    <th className="px-2 py-3 font-medium">Amount</th>
                    <th className="px-2 py-3 font-medium">Stripe status</th>
                    <th className="px-2 py-3 font-medium">Lifecycle event</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paymentData.payments.map((payment) => {
                    const eventLabel = lifecycleLabel(payment);
                    return (
                      <tr key={payment.id} className="align-top hover:bg-muted/20 transition-colors">
                        <td className="px-2 py-3">
                          <Link
                            href={`/orders/${payment.order.id}`}
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                          >
                            {payment.order.id}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(payment.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          <div className="font-medium">{payment.plan.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{payment.source.replace('_', ' ')}</div>
                        </td>
                        <td className="px-2 py-3 font-medium tabular-nums">
                          {formatMoney(payment.amountCents, payment.currency ?? payment.order.currency)}
                        </td>
                        <td className="px-2 py-3">
                          <Badge
                            variant={payment.status === 'succeeded' ? 'default' : 'destructive'}
                            className="capitalize"
                          >
                            {payment.status}
                          </Badge>
                        </td>
                        <td className="px-2 py-3 text-xs">
                          {eventLabel ? (
                            <>
                              <div className="font-medium">{eventLabel}</div>
                              <div className="text-muted-foreground mt-1">
                                {payment.lifecycleEvent.id ?? 'Event recorded'}
                                {payment.lifecycleEvent.at && ` · ${new Date(payment.lifecycleEvent.at).toLocaleDateString()}`}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">No refund or cancellation event</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
