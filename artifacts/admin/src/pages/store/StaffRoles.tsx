import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storesApi, type StoreMember, type StoreRole } from "@/lib/api";
import { PageHeader, StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Info } from "lucide-react";
import { canPublish, isStaffRole } from "@/lib/permissions";

interface Props {
  storeId: string;
  role: string;
}

const ROLE_LEGEND: { role: string; label: string; description: string }[] = [
  {
    role: "store_owner",
    label: "Owner",
    description: "Full access — manage store settings, catalog, members, and help content.",
  },
  {
    role: "store_staff",
    label: "Staff",
    description: "Can curate the catalog and manage store-scoped help. Cannot change member roles or store settings.",
  },
  {
    role: "support",
    label: "Support",
    description: "Read-only access to catalog, customers, and help. Cannot make any changes.",
  },
];

export default function StoreStaff({ storeId, role }: Props) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const isOwner = canPublish(role);

  const { data: members = [], isLoading, error, refetch } = useQuery({
    queryKey: ["store-members", storeId],
    queryFn: () => storesApi.members.list(storeId),
  });

  const staffMembers = members.filter((m) => isStaffRole(m.role));

  const removeMutation = useMutation({
    mutationFn: (userId: string) => storesApi.members.remove(storeId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-members", storeId] });
      toast({ title: "Member removed" });
    },
    onError: (err: Error) =>
      toast({ title: "Remove failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Staff & roles"
        description={`${staffMembers.length} staff member${staffMembers.length !== 1 ? "s" : ""}.`}
        actions={
          isOwner && (
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button size="sm" style={{ background: "hsl(12 49% 58%)", color: "#fff" }}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Invite member
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Invite member</SheetTitle>
                </SheetHeader>
                <InviteForm
                  storeId={storeId}
                  currentRole={role}
                  onDone={() => {
                    setOpen(false);
                    qc.invalidateQueries({ queryKey: ["store-members", storeId] });
                  }}
                />
              </SheetContent>
            </Sheet>
          )
        }
      />

      {/* Members table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6"><SkeletonRows rows={4} cols={3} /></div>
        ) : error ? (
          <ErrorState message="Couldn't load members." onRetry={() => refetch()} />
        ) : staffMembers.length === 0 ? (
          <EmptyState
            title="No staff yet"
            description="Invite your first team member above."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">User ID</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium text-right">Added</th>
                {isOwner && <th className="px-4 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staffMembers.map((m) => (
                <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-mono text-sm text-foreground">{m.userId}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={m.role} />
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                  {isOwner && (
                    <td className="px-4 py-3 text-right">
                      {!canPublish(m.role) && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="p-1 rounded hover:bg-red-50 transition-colors text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove member?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will revoke {m.userId}'s access to your store.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeMutation.mutate(m.userId)}
                                className="bg-destructive text-white hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Role legend */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-display font-semibold text-sm">What each role can do</h3>
        </div>
        <div className="space-y-3">
          {ROLE_LEGEND.map((r) => (
            <div key={r.role} className="flex items-start gap-3">
              <StatusPill status={r.role} className="mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">{r.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InviteForm({
  storeId,
  currentRole,
  onDone,
}: {
  storeId: string;
  currentRole: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<StoreRole>("store_staff");

  const availableRoles: StoreRole[] =
    currentRole === "super_admin"
      ? ["store_owner", "store_staff", "support"]
      : ["store_staff", "support"];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await storesApi.members.add(storeId, { userId, role });
      toast({ title: "Member invited" });
      onDone();
    } catch (err: any) {
      toast({ title: "Invite failed", description: err.message, variant: "destructive" });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label>User ID</Label>
        <Input
          required
          placeholder="u-xxxxxxxx"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">The user must already have a Daybook account.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as StoreRole)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {availableRoles.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">
                {r.replace("store_", "").replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" style={{ background: "hsl(12 49% 58%)", color: "#fff" }}>
        Invite
      </Button>
    </form>
  );
}
