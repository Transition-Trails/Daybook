import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useListUsers } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ArrowRight, Check, ExternalLink, MailPlus, RefreshCw, Users } from "lucide-react";
import { useInvitationStores, useInvitations, useSendInvitation, type InviteRole } from "@/hooks/use-invitations";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  role: z.enum(["super_admin", "store_owner", "store_staff", "support"]),
  storeId: z.string(),
}).superRefine((values, ctx) => {
  if (values.role !== "super_admin" && !values.storeId) {
    ctx.addIssue({ code: "custom", path: ["storeId"], message: "Choose the store this person can access." });
  }
});
type InviteFields = z.infer<typeof schema>;

const roleLabels: Record<InviteRole, string> = {
  super_admin: "Platform super admin",
  store_owner: "Store owner",
  store_staff: "Store staff",
  support: "Store support",
};
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : format(date, "MMM d, yyyy");
}

export default function UsersList() {
  const { data: users, isLoading: usersLoading, isError: usersError, refetch: refetchUsers } = useListUsers();
  const invitations = useInvitations();
  const stores = useInvitationStores();
  const send = useSendInvitation();
  const [confirmation, setConfirmation] = useState("");
  const [sendError, setSendError] = useState("");
  const form = useForm<InviteFields>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", role: "store_staff", storeId: "" },
  });
  const role = form.watch("role");
  const pending = (invitations.data?.invitations ?? []).filter((invite) => !invite.acceptedAt);

  async function submit(values: InviteFields) {
    setConfirmation("");
    setSendError("");
    try {
      await send.mutateAsync({
        email: values.email.trim(),
        role: values.role,
        ...(values.role === "super_admin" ? {} : { storeId: values.storeId }),
      });
      setConfirmation(`Invitation sent to ${values.email.trim()}.`);
      form.reset({ email: "", role: values.role, storeId: values.storeId });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "The invitation could not be sent. Please try again.");
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="border-b border-border pb-6">
        <div className="invitation-eyebrow mb-3">Platform / Access</div>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">People & permissions</h1>
        <p className="mt-2 text-sm text-muted-foreground">Give trusted collaborators the right place to work.</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <Card className="overflow-hidden border-border bg-card">
          <div className="border-b border-border px-6 py-5">
            <div className="flex items-center gap-2"><MailPlus className="h-4 w-4 text-[var(--admin-clay)]" /><h2 className="font-display text-xl font-semibold">Extend an invitation</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">We’ll email a private invitation to the address below.</p>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(submit)} className="space-y-5 p-6">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email address</Label>
                <Input id="invite-email" data-testid="input-invite-email" type="email" autoComplete="email" placeholder="collaborator@example.com" {...form.register("email")} aria-invalid={!!form.formState.errors.email} aria-describedby={form.formState.errors.email ? "invite-email-error" : undefined} />
                {form.formState.errors.email && <p id="invite-email-error" role="alert" className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-role">Access level</Label>
                  <select id="invite-role" data-testid="select-invite-role" {...form.register("role")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </div>
                {role !== "super_admin" && (
                  <div className="space-y-2">
                    <Label htmlFor="invite-store">Store</Label>
                    <select id="invite-store" data-testid="select-invite-store" {...form.register("storeId")} disabled={stores.isLoading || stores.isError} aria-invalid={!!form.formState.errors.storeId} aria-describedby={form.formState.errors.storeId ? "invite-store-error" : undefined} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                      <option value="">{stores.isLoading ? "Loading stores…" : "Select a store"}</option>
                      {stores.data?.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                    </select>
                    {form.formState.errors.storeId && <p id="invite-store-error" role="alert" className="text-sm text-destructive">{form.formState.errors.storeId.message}</p>}
                  </div>
                )}
              </div>
              {stores.isError && role !== "super_admin" && <div role="alert" className="text-sm text-destructive">Stores could not be loaded. <button type="button" data-testid="button-retry-stores" onClick={() => stores.refetch()} className="underline">Retry</button></div>}
              {sendError && <p data-testid="status-invite-error" role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{sendError}</p>}
              {confirmation && <p data-testid="status-invite-sent" role="status" className="flex items-center gap-2 rounded-lg bg-[var(--admin-green)]/10 px-4 py-3 text-sm text-[var(--admin-green)]"><Check className="h-4 w-4" />{confirmation}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                <p className="text-xs text-muted-foreground">Access begins only after they accept.</p>
                <Button type="submit" data-testid="button-send-invitation" disabled={send.isPending || (role !== "super_admin" && stores.isError)} className="gap-2">{send.isPending ? "Sending…" : "Send invitation"}<ArrowRight className="h-4 w-4" /></Button>
              </div>
            </form>
          </Form>
        </Card>

        <Card className="overflow-hidden border-border bg-card">
          <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
            <div><div className="invitation-eyebrow mb-2">Awaiting a reply</div><h2 className="font-display text-xl font-semibold">Pending invitations <span className="text-muted-foreground">{!invitations.isLoading && !invitations.isError ? `(${pending.length})` : ""}</span></h2></div>
            <Button variant="ghost" size="icon" data-testid="button-refresh-invitations" aria-label="Refresh invitations" onClick={() => invitations.refetch()}><RefreshCw className="h-4 w-4" /></Button>
          </div>
          {invitations.isLoading ? <div className="space-y-4 p-6" aria-label="Loading invitations">{[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />)}</div>
            : invitations.isError ? <div className="p-6 text-sm" role="alert"><p>Invitations could not be loaded.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => invitations.refetch()} data-testid="button-retry-invitations">Try again</Button></div>
            : pending.length === 0 ? <div className="px-6 py-12 text-center"><MailPlus className="mx-auto h-7 w-7 text-[var(--admin-clay)]" /><p className="mt-3 font-display text-lg">All caught up.</p><p className="mt-1 text-sm text-muted-foreground">Invitations waiting for a response will appear here.</p></div>
              : <div className="divide-y divide-border">{pending.map((invite) => <div data-testid={`row-invitation-${invite.id}`} key={invite.id} className="flex items-start justify-between gap-3 px-6 py-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{invite.email}</p><p className="mt-1 text-xs text-muted-foreground">{roleLabels[invite.role] ?? invite.role}{invite.storeId ? ` · ${invite.storeName ?? stores.data?.find((store) => store.id === invite.storeId)?.name ?? invite.storeId}` : ""}</p></div><span className="shrink-0 text-right text-xs text-muted-foreground">{new Date(invite.expiresAt).getTime() < Date.now() ? "Expired" : "Expires"}<br />{dateLabel(invite.expiresAt)}</span></div>)}</div>}
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[var(--admin-clay)]" /><h2 className="font-display text-2xl font-semibold">Directory</h2></div>
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Platform access</TableHead><TableHead>Plan</TableHead><TableHead>Joined</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {usersLoading ? <TableRow><TableCell colSpan={5}><div className="space-y-3 py-4" aria-label="Loading users">{[1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-muted" />)}</div></TableCell></TableRow>
                : usersError ? <TableRow><TableCell colSpan={5} className="py-10 text-center">Users could not be loaded. <Button variant="outline" size="sm" onClick={() => refetchUsers()} data-testid="button-retry-users">Retry</Button></TableCell></TableRow>
                  : !(users as any[])?.length ? <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">No users found yet.</TableCell></TableRow>
                    : (users as any[]).map((user) => <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell><div className="flex items-center gap-3">{user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full border" /> : <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted text-xs font-medium text-muted-foreground">{user.name?.charAt(0).toUpperCase() || "U"}</div>}<div><div className="font-medium text-foreground">{user.name}</div><div className="text-xs text-muted-foreground">{user.email}</div></div></div></TableCell>
                      <TableCell><Badge variant={user.platformRole === "super_admin" ? "default" : "secondary"}>{user.platformRole === "super_admin" ? "Super admin" : "Store access via membership"}</Badge></TableCell>
                      <TableCell>{user.plan ? <Badge variant="secondary" className="capitalize">{user.plan}</Badge> : <span className="text-sm text-muted-foreground">Free</span>}</TableCell>
                      <TableCell><span className="text-sm text-muted-foreground">{user.createdAt ? dateLabel(user.createdAt) : "—"}</span></TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="sm" asChild><Link href={`/super/users/${user.id}`} data-testid={`link-user-${user.id}`}><ExternalLink className="mr-1 h-3 w-3" />View</Link></Button></TableCell>
                    </TableRow>)}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}