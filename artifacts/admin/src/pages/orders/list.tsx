import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, ExternalLink, Loader2, Receipt, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, PageHeader } from "@/components/shared";
import { ordersApi, type ReceiptStatus, type SupportOrder } from "@/lib/api";

type OrderFilter = ReceiptStatus | "all";

const FILTERS: Array<{ value: OrderFilter; label: string }> = [
  { value: "all", label: "All orders" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
];

const statusDetails = {
  sent: { label: "Sent", icon: CheckCircle2, className: "border-green-200 bg-green-50 text-green-700" },
  pending: { label: "Pending", icon: Clock3, className: "border-amber-200 bg-amber-50 text-amber-700" },
  failed: { label: "Failed", icon: TriangleAlert, className: "border-red-200 bg-red-50 text-red-700" },
} as const;

function receiptStatus(order: SupportOrder): ReceiptStatus {
  if (order.receiptLastError) return "failed";
  if (order.receiptSentAt) return "sent";
  return "pending";
}

function formatMoney(amountCents: number, currency: string): string {
  return (amountCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  });
}

export default function StoreOrders({ storeId }: { storeId: string }) {
  const [filter, setFilter] = useState<OrderFilter>("all");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["store-orders", storeId, filter],
    queryFn: () => ordersApi.list(storeId, filter === "all" ? undefined : filter),
    enabled: !!storeId,
  });
  const orders = data?.orders ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Orders"
        description="Review purchases and resolve receipt delivery issues for this store."
        actions={<Badge variant="outline">{orders.length} shown</Badge>}
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 p-3" role="tablist" aria-label="Receipt delivery status">
          {FILTERS.map((item) => (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={filter === item.value ? "default" : "outline"}
              role="tab"
              aria-selected={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading orders…
          </div>
        ) : error ? (
          <ErrorState message="Couldn’t load this store’s orders." onRetry={() => refetch()} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={filter === "all" ? "No orders yet" : `No ${filter} receipts`}
            description={filter === "all" ? "Completed purchases will appear here." : `There are no orders with ${filter} receipt delivery status.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Order / customer</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Receipt</th>
                  <th className="px-4 py-3 font-medium">Delivery details</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => {
                  const status = receiptStatus(order);
                  const details = statusDetails[status];
                  const StatusIcon = details.icon;
                  return (
                    <tr key={order.id} className="align-top transition-colors hover:bg-muted/20">
                      <td className="px-5 py-4">
                        <Link href={`/store/${storeId}/orders/${order.id}`} className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
                          {order.id}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        <div className="mt-1 font-medium">{order.buyerName || order.buyerEmail}</div>
                        {order.buyerName && <div className="text-xs text-muted-foreground">{order.buyerEmail}</div>}
                        <div className="mt-1 text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString()}</div>
                      </td>
                      <td className="px-4 py-4 font-medium tabular-nums">{formatMoney(order.totalCents, order.currency)}</td>
                      <td className="px-4 py-4">
                        <Badge variant="outline" className={`gap-1.5 ${details.className}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {details.label}
                        </Badge>
                      </td>
                      <td className="max-w-sm px-4 py-4 text-xs">
                        {status === "failed" ? (
                          <>
                            <p className="break-words font-medium text-red-700">{order.receiptLastError}</p>
                            {order.receiptLastAttemptAt && (
                              <p className="mt-1 text-muted-foreground">Last attempt: {new Date(order.receiptLastAttemptAt).toLocaleString()}</p>
                            )}
                          </>
                        ) : status === "sent" && order.receiptSentAt ? (
                          <p className="text-muted-foreground">Sent {new Date(order.receiptSentAt).toLocaleString()}</p>
                        ) : order.receiptLastAttemptAt ? (
                          <p className="text-muted-foreground">Last attempt: {new Date(order.receiptLastAttemptAt).toLocaleString()}</p>
                        ) : (
                          <p className="text-muted-foreground">No delivery attempt yet</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/store/${storeId}/orders/${order.id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}