import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { format } from "date-fns";
import { ArrowRight, BookMarked, Check, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAcceptInvitation, useInvitationPreview, type InviteRole } from "@/hooks/use-invitations";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const registrationSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  password: z.string().min(8, "Use at least 8 characters."),
});
const signInSchema = z.object({
  password: z.string().min(1, "Enter your password."),
});
type RegistrationFields = z.infer<typeof registrationSchema>;
type SignInFields = z.infer<typeof signInSchema>;

const roleLabels: Record<InviteRole, string> = {
  super_admin: "Platform super admin",
  store_owner: "Store owner",
  store_staff: "Store staff",
  support: "Store support",
};

function safeMessage(error: unknown, token: string, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return token ? message.split(token).join("[private link]") : message;
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function Invite() {
  const token = new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();
  const session = useQuery({
    queryKey: ["invitation", "current-session"],
    queryFn: async () => {
      try { return await apiFetch<{ email?: string }>("/auth/me"); }
      catch { return null; }
    },
    enabled: !!token && !!preview.data?.requiresSignIn,
    retry: false,
  });
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const registration = useForm<RegistrationFields>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { name: "", password: "" },
  });
  const signIn = useForm<SignInFields>({
    resolver: zodResolver(signInSchema),
    defaultValues: { password: "" },
  });
  const invitation = preview.data;
  const expired = invitation ? new Date(invitation.expiresAt).getTime() <= Date.now() : false;
  const sameAccount = !!invitation && !!session.data?.email && session.data.email.toLowerCase() === invitation.email.toLowerCase();
  const otherAccount = !!session.data?.email && !sameAccount;

  function finish() {
    setDone(true);
    window.setTimeout(() => { window.location.href = "/"; }, 1700);
  }

  async function registerAndAccept(values: RegistrationFields) {
    if (!token || !invitation || expired || invitation.requiresSignIn) return;
    setActionError("");
    try {
      await accept.mutateAsync({ token, name: values.name.trim(), password: values.password });
      finish();
    } catch (error) {
      setActionError(safeMessage(error, token, "Could not accept this invitation. Please try again."));
    }
  }

  async function acceptExisting() {
    if (!token || !invitation || expired || !invitation.requiresSignIn || !sameAccount) return;
    setActionError("");
    try {
      await accept.mutateAsync({ token });
      finish();
    } catch (error) {
      setActionError(safeMessage(error, token, "Could not accept this invitation. Please try again."));
    }
  }

  async function signInAndAccept(values: SignInFields) {
    if (!token || !invitation || expired || !invitation.requiresSignIn) return;
    setActionError("");
    setBusy(true);
    try {
      await apiFetch("/auth/staff/login", {
        method: "POST",
        body: JSON.stringify({ email: invitation.email, password: values.password }),
      });
      // A successful login response alone is not enough: confirm that the new
      // session belongs to the invitation's recipient before submitting token.
      const current = await apiFetch<{ email?: string }>("/auth/me");
      if (current.email?.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new Error("This account does not match the invitation. Sign in with the invited email.");
      }
      await accept.mutateAsync({ token });
      finish();
    } catch (error) {
      setActionError(safeMessage(error, token, "Sign-in or acceptance failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function googleSignInAndAccept() {
    if (!token || !invitation || expired || !invitation.requiresSignIn || busy) return;
    setActionError("");
    const w = 500, h = 620;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(
      "/api/auth/google",
      "daybook-google-auth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`,
    );
    if (!popup) {
      setActionError("The sign-in window was blocked. Allow popups for Daybook and try again.");
      return;
    }
    setBusy(true);
    let handled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(timer);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup || event.data?.type !== "daybook:auth_success" || handled) return;
      handled = true;
      cleanup();
      popup.close();
      void (async () => {
        try {
          // Refresh the session after the OAuth callback, then verify the
          // invited address before the invitation token is ever submitted.
          const { data: current } = await session.refetch();
          if (!current?.email || current.email.toLowerCase() !== invitation.email.toLowerCase()) {
            throw new Error("This Google account does not match the invited email. Sign in with the invited account.");
          }
          await accept.mutateAsync({ token });
          finish();
        } catch (error) {
          setActionError(safeMessage(error, token, "Google sign-in or acceptance failed. Please try again."));
        } finally {
          setBusy(false);
        }
      })();
    };
    window.addEventListener("message", onMessage);
    const timer = window.setInterval(() => {
      if (popup.closed && !handled) {
        cleanup();
        setBusy(false);
      }
    }, 500);
  }

  return (
    <main className="invitation-page relative flex min-h-[100dvh] flex-col">
      <div className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-7 sm:px-10">
        <Link href="/" data-testid="link-daybook-home" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--admin-ink)]"><BookMarked className="h-6 w-6 text-[var(--admin-clay)]" />Daybook <span className="font-normal text-[var(--admin-muted)]">Studio</span></Link>
        <span className="invitation-eyebrow hidden sm:block">An invitation to collaborate</span>
      </div>

      <div className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pb-16 pt-8 sm:px-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-20">
        <div className="max-w-lg">
          <div className="invitation-eyebrow mb-5">A place at the table</div>
          <h1 className="font-display text-5xl font-semibold leading-[1.07] tracking-tight sm:text-6xl">Good work is<br /><em className="font-serif font-normal text-[var(--admin-clay-hover)]">made together.</em></h1>
          <p className="mt-7 max-w-md text-base leading-7 text-[var(--admin-secondary)]">You’ve been invited into the Daybook workspace. A thoughtful place to build, edit, and look after the details that matter.</p>
          <div className="mt-12 flex items-center gap-3 border-t border-[var(--admin-border)] pt-6 text-sm text-[var(--admin-muted)]"><ShieldCheck className="h-5 w-5 text-[var(--admin-green)]" /><span>Your access is private and linked to your email.</span></div>
        </div>

        <section className="invitation-panel w-full rounded-2xl p-6 sm:p-9" aria-labelledby="invite-heading">
          {done ? (
            <div className="py-10 text-center" role="status" data-testid="status-invite-accepted">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--admin-green)]/10"><Check className="h-7 w-7 text-[var(--admin-green)]" /></div>
              <h2 id="invite-heading" className="font-display text-3xl font-semibold">You’re in.</h2>
              <p className="mt-3 text-sm text-muted-foreground">Your invitation has been accepted. Opening your workspace…</p>
              <Button type="button" className="mt-7" onClick={() => { window.location.href = "/"; }} data-testid="button-open-workspace">Open workspace <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </div>
          ) : !token ? (
            <div className="py-8 text-center" data-testid="status-invite-missing">
              <Mail className="mx-auto mb-5 h-8 w-8 text-[var(--admin-clay)]" />
              <h2 id="invite-heading" className="font-display text-2xl font-semibold">Your invitation link is missing.</h2>
              <p className="mt-3 text-sm text-muted-foreground">Open the full link from your invitation email, or ask the sender for a new one.</p>
            </div>
          ) : preview.isLoading ? (
            <div aria-label="Loading invitation" className="space-y-5 py-4">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" /><div className="h-9 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-24 animate-pulse rounded-lg bg-muted" /><div className="h-10 animate-pulse rounded-lg bg-muted" />
            </div>
          ) : preview.isError || expired || !invitation ? (
            <div className="py-8 text-center" role="alert" data-testid="status-invite-unavailable">
              <LockKeyhole className="mx-auto mb-5 h-8 w-8 text-[var(--admin-clay)]" />
              <h2 id="invite-heading" className="font-display text-2xl font-semibold">{expired || (preview.error as { status?: number } | null)?.status === 410 ? "This invitation has expired." : "This invitation is unavailable."}</h2>
              <p className="mt-3 text-sm text-muted-foreground">The link may have expired, already been used, or could not be found. Ask the person who invited you to send another.</p>
              {preview.isError && <Button type="button" variant="outline" onClick={() => preview.refetch()} className="mt-6" data-testid="button-retry-preview">Try again</Button>}
            </div>
          ) : (
            <>
              <div className="invitation-eyebrow mb-3">Your invitation</div>
              <h2 id="invite-heading" className="font-display text-3xl font-semibold tracking-tight">Welcome to Daybook.</h2>
              <p className="mt-2 text-sm text-muted-foreground">{invitation.requiresSignIn ? "Sign in to your account to accept your invitation." : "Create your account to accept your invitation."}</p>
              <div className="my-7 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-subtle)] p-5">
                <div className="text-sm font-medium" data-testid="text-invite-email">{invitation.email}</div>
                <div className="mt-2 text-sm text-[var(--admin-secondary)]" data-testid="text-invite-role">{roleLabels[invitation.role] ?? invitation.role}{invitation.storeName ? ` · ${invitation.storeName}` : ""}</div>
                <div className="mt-4 border-t border-[var(--admin-border)] pt-3 text-xs text-[var(--admin-muted)]">Valid until {format(new Date(invitation.expiresAt), "MMMM d, yyyy")}</div>
              </div>

              {invitation.requiresSignIn ? session.isLoading ? (
                <div className="h-24 animate-pulse rounded-lg bg-muted" aria-label="Checking your session" />
              ) : sameAccount ? (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--admin-secondary)]">You’re signed in with the invited address. Your access is ready when you are.</p>
                  <Button type="button" className="w-full gap-2" onClick={acceptExisting} disabled={accept.isPending} data-testid="button-accept-existing">{accept.isPending ? "Accepting…" : "Accept invitation"}<ArrowRight className="h-4 w-4" /></Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <Button type="button" variant="outline" className="w-full gap-2" onClick={googleSignInAndAccept} disabled={busy || accept.isPending} data-testid="button-google-sign-in-accept"><GoogleIcon />Continue with Google</Button>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>or use your password</span><span className="h-px flex-1 bg-border" /></div>
                  <Form {...signIn}>
                  <form onSubmit={signIn.handleSubmit(signInAndAccept)} className="space-y-4">
                    {otherAccount && <p className="rounded-lg bg-[var(--admin-clay)]/10 p-3 text-sm text-[var(--admin-clay-hover)]">You’re signed in with a different account. Sign in as {invitation.email} to continue.</p>}
                    <div className="space-y-2"><Label htmlFor="invite-sign-in-password">Password for {invitation.email}</Label><Input id="invite-sign-in-password" data-testid="input-invite-sign-in-password" type="password" autoComplete="current-password" {...signIn.register("password")} aria-invalid={!!signIn.formState.errors.password} /><p role="alert" className="text-xs text-destructive">{signIn.formState.errors.password?.message}</p></div>
                    <Button type="submit" className="w-full gap-2" disabled={busy || accept.isPending} data-testid="button-sign-in-accept">{busy ? "Checking your account…" : "Sign in & accept"}<ArrowRight className="h-4 w-4" /></Button>
                    <p className="text-xs leading-5 text-muted-foreground">Use the password for the email address shown above. Your invitation is accepted only after you sign in.</p>
                  </form>
                  </Form>
                </div>
              ) : (
                <Form {...registration}>
                  <form onSubmit={registration.handleSubmit(registerAndAccept)} className="space-y-4">
                    <div className="space-y-2"><Label htmlFor="invite-name">Your name</Label><Input id="invite-name" data-testid="input-invite-name" autoComplete="name" placeholder="How should we address you?" {...registration.register("name")} aria-invalid={!!registration.formState.errors.name} /><p role="alert" className="text-xs text-destructive">{registration.formState.errors.name?.message}</p></div>
                    <div className="space-y-2"><Label htmlFor="invite-password">Create a password</Label><Input id="invite-password" data-testid="input-invite-password" type="password" autoComplete="new-password" placeholder="At least 8 characters" {...registration.register("password")} aria-invalid={!!registration.formState.errors.password} /><p role="alert" className="text-xs text-destructive">{registration.formState.errors.password?.message}</p></div>
                    <Button type="submit" className="w-full gap-2" disabled={accept.isPending} data-testid="button-create-accept">{accept.isPending ? "Creating your account…" : "Create account & accept"}<ArrowRight className="h-4 w-4" /></Button>
                  </form>
                </Form>
              )}
              {actionError && <p data-testid="status-invite-error" role="alert" className="mt-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{actionError}</p>}
            </>
          )}
        </section>
      </div>
      <footer className="relative mx-auto w-full max-w-6xl border-t border-[var(--admin-border)] px-6 py-5 text-xs text-[var(--admin-muted)] sm:px-10">Daybook Studio · A workspace for considered work</footer>
    </main>
  );
}