import { useQuery } from "@tanstack/react-query";
import { storesApi } from "@/lib/api";
import { PageHeader, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Users } from "lucide-react";

interface Props {
  storeId: string;
}

export default function StoreCustomers({ storeId }: Props) {
  const { data: members = [], isLoading, error, refetch } = useQuery({
    queryKey: ["store-members", storeId],
    queryFn: () => storesApi.members.list(storeId),
  });

  const customers = members.filter((m) => m.role === "customer");

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Customers"
        description={`${customers.length} customer${customers.length !== 1 ? "s" : ""} in this store.`}
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6"><SkeletonRows rows={5} cols={3} /></div>
        ) : error ? (
          <ErrorState message="Couldn't load customers." onRetry={() => refetch()} />
        ) : customers.length === 0 ? (
          <EmptyState
            title="No customers yet"
            icon={Users}
            description="Customers who join your store will appear here."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">User ID</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium text-right">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.map((m) => (
                <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-mono text-sm text-foreground">{m.userId}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{m.role}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
