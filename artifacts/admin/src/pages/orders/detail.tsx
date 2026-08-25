import { useParams, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock3, ExternalLink, Loader2, Mail, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/shared";
import { useToast } from "@/hooks/use-toast";
import { ordersApi, type SupportOrder } from "@/lib/api";

function receiptStatus(order: SupportOrder): "sent" | "pending" | "failed" {
  if (order.receiptLastError) return "failed";
  if (order.receiptSentAt) return "sent";
  return "pending";
}

const statusDetails = {
  sent: { label: "Sent", icon: CheckCircle2, className: "border-green-200 bg-green-50 text-green-700" },
  pending: { label: "Pending", icon: Clock3, className: "border-amber-200 bg-amber-50 text-amber-700" },
  failed: { label: "Failed", icon: TriangleAlert, className: "border-red-200 bg-red-50 text-red-700" },
} as const;

function formatMoney(amountCents: number, currency: string): string {
  return (amountCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  });
}

export default function OrderDetail() {
  const { id, storeId } = useParams();
  const orderId = id ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const detailQueryKey = ["support-order", orderId, storeId ?? "platform"];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => ordersApi.get(orderId, storeId),
    enabled: !!orderId,
  });
  const resend = useMutation({
    mutationFn: () => ordersApi.resendReceipt(orderId, storeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: detailQueryKey });
      queryClient.invalidateQueries({ queryKey: ["store-orders", storeId] });
      toast({ title: "Receipt resend requested", description: "The receipt delivery attempt has completed." });
    },
    onError: (err: Error) => {
      toast({ title: "Receipt resend failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (error) {
    return <ErrorState message="Couldn’t load this order." onRetry={() => refetch()} />;
  }

  const order = data?.order;
  if (!order) return <EmptyState title="Order not found" description="This order may have been removed." />;

  const status = receiptStatus(order);
  const statusInfo = statusDetails[status];
  const StatusIcon = statusInfo.icon;
  const backHref = storeId ? `/store/${storeId}/orders` : "/users";

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={backHref}><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight">Order {order.id}</h1>
          <p className="text-sm text-muted-foreground">
            Created {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Order summary</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{order.buyerName || order.buyerEmail}</p>
          </div>
          <Badge variant="outline">{order.currency.toUpperCase()}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y divide-border rounded-lg border border-border">
            {order.items.map((item) => (
              <div key={`${item.name}-${item.priceCents}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span>{item.name}</span>
                <span className="font-medium tabular-nums">{formatMoney(item.priceCents, order.currency)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 px-4 py-3 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(order.totalCents, order.currency)}</span>
            </div>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Store</span>
              <div className="font-mono mt-1">{order.storeId}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Receipt delivery</span>
              <div className="mt-1">
                <Badge variant="outline" className={`gap-1.5 ${statusInfo.className}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {statusInfo.label}
                </Badge>
              </div>
            </div>
          </div>

          {status === "failed" && (
            <div className="rounded-lg border border-red-200 bg-red-50/70 p-4 text-sm">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <div className="min-w-0">
                  <p className="font-semibold text-red-800">Last delivery attempt failed</p>
                  <p className="mt-1 break-words text-red-700">{order.receiptLastError}</p>
                  {order.receiptLastAttemptAt && (
                    <p className="mt-2 text-xs text-red-700/80">
                      Last attempted {new Date(order.receiptLastAttemptAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {status === "sent" && order.receiptSentAt && (
            <p className="text-sm text-muted-foreground">
              Delivered attempt recorded {new Date(order.receiptSentAt).toLocaleString()}.
            </p>
          )}

          {status === "pending" && order.receiptLastAttemptAt && (
            <p className="text-sm text-muted-foreground">
              Last attempted {new Date(order.receiptLastAttemptAt).toLocaleString()}.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => resend.mutate()}
              disabled={resend.isPending}
            >
              {resend.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {resend.isPending ? "Sending…" : "Resend receipt"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {order.receiptAttempts} delivery {order.receiptAttempts === 1 ? "attempt" : "attempts"} recorded
            </span>
          </div>

          <a href={`mailto:${order.buyerEmail}`} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <Mail className="w-3.5 h-3.5" />
            Contact customer
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}