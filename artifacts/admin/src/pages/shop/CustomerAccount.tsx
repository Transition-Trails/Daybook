import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpen, Check, Mail, ShieldCheck } from "lucide-react";

interface Customer { id: string; name: string; email: string }
interface Store { name: string }
type Mode = "login" | "register" | "reset";

async function readMessage(response: Response): Promise<any> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || result.error || "Something went wrong. Please try again.");
  return result;
}
async function post(path: string, payload: Record<string, string>) {
  return readMessage(await fetch(path, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }));
}
async function fetchCustomer(): Promise<Customer | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error("Unable to load your account.");
  return res.json();
}
async function fetchStore(slug: string): Promise<Store> {
  const res = await fetch(`/api/shop/${encodeURIComponent(slug)}`, { credentials: "include" });
  if (!res.ok) throw new Error("Store not found.");
  return (await res.json()).store;
}

function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 4.06 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function safeDestination(raw: string | null, slug: string) {
  const home = `/s/${encodeURIComponent(slug)}`;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return home;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || (url.pathname !== home && !url.pathname.startsWith(`${home}/`))) return home;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return home;
  }
}

export default function CustomerAccount() {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const slug = storeSlug || "";
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const popupCleanup = useRef<(() => void) | null>(null);
  const verifiedToken = useRef<string | null>(null);
  const query = new URLSearchParams(window.location.search);
  const verifyToken = query.get("verify");
  const resetToken = query.get("reset");
  const returnTo = query.get("returnTo");
  const destination = safeDestination(returnTo, slug);
  const home = `/s/${encodeURIComponent(slug)}`;
  const storeNameFallback = "Daybook";

  const stripToken = (key: "verify" | "reset") => {
    const url = new URL(window.location.href);
    url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const storeQuery = useQuery({ queryKey: ["shop-account-brand", slug], queryFn: () => fetchStore(slug), enabled: !!slug, retry: false });
  const customerQuery = useQuery({
    queryKey: ["shop-me"], queryFn: fetchCustomer, retry: false, staleTime: 0, refetchOnMount: "always",
  });
  const verifyMutation = useMutation({
    mutationFn: (token: string) => post("/api/auth/customer/verify", { token }),
    onSuccess: async () => {
      setVerificationComplete(true);
      setMessage("Your email is verified and you are signed in.");
      setError("");
      stripToken("verify");
      await queryClient.invalidateQueries({ queryKey: ["shop-me"] });
    },
    onError: (e: Error) => setError(e.message),
  });
  const verify = verifyMutation.mutate;
  useEffect(() => {
    if (verifyToken && verifiedToken.current !== verifyToken) {
      verifiedToken.current = verifyToken;
      verify(verifyToken);
    }
  }, [verifyToken, verify]);

  const loginMutation = useMutation({
    mutationFn: () => post("/api/auth/customer/login", { email, password }) as Promise<Customer>,
    onSuccess: async (customer) => {
      queryClient.setQueryData(["shop-me"], customer);
      await queryClient.invalidateQueries({ queryKey: ["shop-me"] });
      navigate(destination);
    },
    onError: (e: Error) => setError(e.message),
  });
  const registerMutation = useMutation({
    mutationFn: () => post("/api/auth/customer/register", { storeSlug: slug, name, email, password }),
    onSuccess: (result) => { setMessage(result.message || "Check your inbox for a verification link."); setError(""); },
    onError: (e: Error) => setError(e.message),
  });
  const resetRequestMutation = useMutation({
    mutationFn: () => post("/api/auth/customer/password-reset/request", { storeSlug: slug, email }),
    onSuccess: (result) => { setMessage(result.message || "If an account exists, password reset instructions have been sent."); setError(""); },
    onError: (e: Error) => setError(e.message),
  });
  const resetConfirmMutation = useMutation({
    mutationFn: () => post("/api/auth/customer/password-reset/confirm", { token: resetToken!, password }),
    onSuccess: () => {
      setResetComplete(true);
      setPassword("");
      setMessage("Password updated. Sign in with your new password.");
      setError("");
      stripToken("reset");
      setMode("login");
    },
    onError: (e: Error) => setError(e.message),
  });
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Unable to sign out. Please try again.");
    },
    onSuccess: async () => {
      queryClient.setQueryData(["shop-me"], null);
      await queryClient.invalidateQueries({ queryKey: ["shop-me"] });
      setMessage("You have been signed out.");
      setError("");
    },
    onError: (e: Error) => setError(e.message),
  });

  useEffect(() => () => popupCleanup.current?.(), []);
  const startGoogleSignIn = () => {
    setError("");
    setMessage("");
    popupCleanup.current?.();
    const w = 500, h = 620;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open("/api/auth/google", "daybook-google-auth", `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);
    if (!popup) {
      setError("Your browser blocked the sign-in window. Allow pop-ups for this site and try again.");
      return;
    }
    setGooglePending(true);
    let settled = false;
    let interval: ReturnType<typeof setInterval>;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(interval);
      popupCleanup.current = null;
    };
    const onMessage = async (event: MessageEvent) => {
      if (settled || event.origin !== window.location.origin || event.source !== popup || event.data?.type !== "daybook:auth_success") return;
      settled = true;
      cleanup();
      popup.close();
      try {
        const result = await customerQuery.refetch();
        if (result.error || !result.data) throw new Error("Sign-in finished, but we couldn't load your account. Please try again.");
        queryClient.setQueryData(["shop-me"], result.data);
        navigate(destination);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to complete Google sign-in. Please try again.");
      } finally {
        setGooglePending(false);
      }
    };
    window.addEventListener("message", onMessage);
    interval = setInterval(() => {
      if (popup.closed && !settled) {
        settled = true;
        cleanup();
        setGooglePending(false);
        setError("The Google sign-in window was closed before sign-in finished. You can try again.");
      }
    }, 500);
    popupCleanup.current = cleanup;
  };

  const awaitingVerification = Boolean(verifyToken && !verificationComplete);
  const changingPassword = Boolean(resetToken && !resetComplete);
  const busy = loginMutation.isPending || registerMutation.isPending || resetRequestMutation.isPending ||
    resetConfirmMutation.isPending || verifyMutation.isPending || logoutMutation.isPending || googlePending;
  const switchMode = (next: Mode) => {
    setMode(next); setError(""); setMessage(""); setPassword("");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || awaitingVerification) return;
    setError(""); setMessage("");
    if (changingPassword) resetConfirmMutation.mutate();
    else if (mode === "register") registerMutation.mutate();
    else if (mode === "reset") resetRequestMutation.mutate();
    else loginMutation.mutate();
  };
  const storeName = storeQuery.data?.name || storeNameFallback;
  const signedIn = !!customerQuery.data;
  const loading = customerQuery.isPending || storeQuery.isPending;
  const title = loading ? "Making room for you" : signedIn ? "Good to see you again." : awaitingVerification ? "One last page." :
    changingPassword ? "A fresh start." : mode === "register" ? "Make it yours." : mode === "reset" ? "Let's get you back." : "Welcome back.";
  const description = signedIn ? "Your space for the things you're making and keeping." :
    awaitingVerification ? "We're checking your email link. This should only take a moment." :
    changingPassword ? "Choose a new password for your account." :
    mode === "register" ? "Create an account to save your place and bring your ideas to life." :
    mode === "reset" ? "We'll send a reset link to the email on your account." :
    "Sign in to pick up right where you left off.";

  return (
    <main className="daybook-account">
      <style>{`
        .daybook-account { --ink:#263344; --paper:#f7f1e8; --cream:#fffcf7; --terracotta:#a95741; --line:#dfd4c6; --muted:#685f58; min-height:100dvh; background:var(--paper); color:var(--ink); font-family:var(--app-font-sans),sans-serif; }
        .daybook-account * { box-sizing:border-box; }
        .daybook-account a { color:inherit; }
        .daybook-account button, .daybook-account input { font:inherit; }
        .daybook-account button { cursor:pointer; }
        .daybook-account button:disabled { cursor:not-allowed; opacity:.55; }
        .daybook-account :is(a,button,input):focus-visible { outline:3px solid #b16b54; outline-offset:3px; }
        .da-header { height:74px; display:flex; align-items:center; justify-content:space-between; padding:0 clamp(22px,5vw,80px); border-bottom:1px solid var(--line); background:var(--cream); }
        .da-brand { display:flex; align-items:center; gap:12px; text-decoration:none; font-family:var(--app-font-display),Georgia,serif; font-size:23px; font-weight:600; letter-spacing:-.045em; }
        .da-brand-mark { width:30px; height:34px; display:grid; place-items:center; background:var(--terracotta); color:var(--cream); border-radius:2px 7px 7px 2px; }
        .da-back { display:flex; align-items:center; gap:9px; font-size:13px; font-weight:650; text-decoration:none; border-bottom:1px solid transparent; }
        .da-back:hover { border-color:currentColor; }
        .da-main { display:grid; grid-template-columns:minmax(0, 1fr) minmax(420px, 1fr); min-height:calc(100dvh - 74px); }
        .da-story { position:relative; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between; padding:clamp(40px,6vw,94px); background:#e9ded0; min-height:680px; }
        .da-story:before { content:""; position:absolute; inset:0; pointer-events:none; opacity:.22; background-image:radial-gradient(#ad9a87 .65px,transparent .65px); background-size:7px 7px; }
        .da-story-content,.da-story-footer,.da-book { position:relative; z-index:1; }
        .da-eyebrow { margin:0 0 26px; font-family:var(--app-font-mono),monospace; text-transform:uppercase; letter-spacing:.19em; font-size:10px; font-weight:700; color:#805647; }
        .da-story h2 { max-width:560px; margin:0; font:400 clamp(42px,5.4vw,82px)/1.05 var(--app-font-display),Georgia,serif; letter-spacing:-.055em; }
        .da-story h2 em { color:var(--terracotta); font-weight:400; }
        .da-story-copy { max-width:320px; margin:23px 0 0; font-size:15px; line-height:1.7; color:#514c47; }
        .da-book { align-self:center; width:min(53%,310px); aspect-ratio: .85; margin:30px 0 10px; transform:rotate(-8deg); filter:drop-shadow(20px 27px 16px rgba(57,46,42,.2)); }
        .da-book-cover { position:absolute; inset:0; padding:13% 10%; background:#b76851; border:1px solid #8e4b3a; border-radius:4px 15px 15px 4px; box-shadow:inset 10px 0 10px -8px #783e34, inset -5px 0 4px -4px #774134; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff4e7; text-align:center; }
        .da-book-cover:before { content:""; position:absolute; inset:6%; border:1px solid rgba(255,239,220,.56); border-radius:2px 11px 11px 2px; }
        .da-book-cover span { font-family:var(--app-font-mono),monospace; font-size:clamp(7px,.75vw,11px); letter-spacing:.24em; text-transform:uppercase; }
        .da-book-cover strong { margin:18px 0; font:italic 400 clamp(25px,3vw,46px)/1.05 var(--app-font-display),Georgia,serif; letter-spacing:-.045em; }
        .da-book-cover small { font-size:10px; letter-spacing:.1em; }
        .da-story-footer { border-top:1px solid #cbbbab; padding-top:18px; display:flex; justify-content:space-between; gap:12px; font-size:11px; color:#625b54; letter-spacing:.04em; }
        .da-form-side { padding:54px 24px 60px; display:flex; align-items:center; justify-content:center; background:var(--cream); }
        .da-panel { width:min(100%,420px); }
        .da-overline { display:flex; align-items:center; gap:9px; margin:0 0 18px; font-family:var(--app-font-mono),monospace; font-size:10px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:var(--terracotta); }
        .da-overline:before { content:""; width:21px; height:1px; background:currentColor; }
        .da-panel h1 { margin:0; font:400 clamp(38px,4vw,55px)/1.1 var(--app-font-display),Georgia,serif; letter-spacing:-.055em; }
        .da-description { margin:13px 0 29px; color:var(--muted); line-height:1.65; font-size:14px; }
        .da-tabs { display:grid; grid-template-columns:1fr 1fr; border-bottom:1px solid var(--line); margin-bottom:25px; }
        .da-tab { padding:12px 8px 13px; background:none; border:0; border-bottom:2px solid transparent; color:var(--muted); font-size:13px; font-weight:650; }
        .da-tab[aria-pressed="true"] { color:var(--ink); border-color:var(--terracotta); }
        .da-field { display:block; margin-bottom:17px; font-size:12px; font-weight:700; color:var(--ink); }
        .da-field input { display:block; width:100%; margin-top:8px; padding:13px 14px; border:1px solid #cbbeb0; border-radius:7px; background:#fffefa; color:var(--ink); font-size:15px; line-height:1.3; }
        .da-field input::placeholder { color:#9d9185; }
        .da-field input:focus { border-color:var(--terracotta); }
        .da-hint { font-size:12px; line-height:1.5; color:var(--muted); margin:-7px 0 19px; }
        .da-primary { width:100%; min-height:48px; display:flex; align-items:center; justify-content:center; gap:10px; padding:12px 20px; color:#fffaf4; background:#9d4d38; border:1px solid #9d4d38; border-radius:7px; font-size:14px; font-weight:700; transition:transform .18s ease,background .18s ease; }
        .da-primary:hover:not(:disabled) { background:#843e2d; transform:translateY(-2px); }
        .da-secondary { width:100%; min-height:48px; display:flex; align-items:center; justify-content:center; gap:11px; padding:12px 18px; background:#fffefa; border:1px solid #cbbeb0; border-radius:7px; color:var(--ink); font-size:14px; font-weight:700; transition:transform .18s ease,background .18s ease; }
        .da-secondary:hover:not(:disabled) { background:#f4ebe1; transform:translateY(-2px); }
        .da-divider { display:flex; align-items:center; gap:14px; margin:20px 0; font-size:11px; color:#776d64; text-transform:uppercase; letter-spacing:.12em; }
        .da-divider:before,.da-divider:after { content:""; height:1px; flex:1; background:var(--line); }
        .da-text-action { display:block; margin:18px auto 0; padding:5px; border:0; background:none; color:#874835; font-size:13px; font-weight:650; text-decoration:underline; text-underline-offset:3px; }
        .da-note { display:flex; gap:10px; align-items:flex-start; margin-top:28px; padding-top:20px; border-top:1px solid var(--line); font-size:12px; line-height:1.55; color:var(--muted); }
        .da-note svg { flex:none; color:#94634c; }
        .da-alert { padding:12px 14px; border-radius:7px; margin:0 0 18px; font-size:13px; line-height:1.55; background:#f9e9e3; color:#773c31; border:1px solid #ebc8bb; }
        .da-alert[data-kind="success"] { background:#edf3e9; color:#355941; border-color:#cbdcce; }
        .da-center { padding:15px 0; text-align:center; }
        .da-round-icon { width:58px; height:58px; display:grid; place-items:center; border-radius:50%; margin:0 auto 19px; background:#efe2d3; color:#9d4d38; }
        .da-center p { font-size:14px; line-height:1.6; color:var(--muted); }
        .da-center .da-primary,.da-center .da-secondary { margin-top:18px; }
        .da-skeleton { height:44px; margin:14px 0; border-radius:6px; background:linear-gradient(90deg,#eee5da 20%,#f7f1e9 50%,#eee5da 80%); background-size:200% 100%; animation:da-shimmer 1.4s infinite linear; }
        @keyframes da-shimmer { to { background-position-x:-200%; } }
        @media (max-width:850px) { .da-main { grid-template-columns:1fr; } .da-story { min-height:0; padding:30px 24px; } .da-story h2 { font-size:35px; } .da-story-copy,.da-book,.da-story-footer { display:none; } .da-eyebrow { margin-bottom:10px; } .da-form-side { padding:40px 24px 70px; min-height:calc(100dvh - 210px); align-items:flex-start; } }
        @media (max-width:500px) { .da-header { height:64px; padding:0 18px; } .da-brand { font-size:21px; } .da-back span { display:none; } .da-story { padding:26px 23px; } .da-story h2 { font-size:31px; } .da-form-side { padding:37px 23px 55px; } .da-panel h1 { font-size:41px; } }
        @media (prefers-reduced-motion:reduce) { .da-primary,.da-secondary { transition:none; } .da-primary:hover:not(:disabled),.da-secondary:hover:not(:disabled) { transform:none; } .da-skeleton { animation:none; } }
      `}</style>
      <header className="da-header">
        <a className="da-brand" href={home} data-testid="link-store-brand" aria-label={`${storeName} store home`}>
          <span className="da-brand-mark"><BookOpen size={18} strokeWidth={1.8} /></span>
          <span data-testid="text-store-name">{storeName}</span>
        </a>
        <a className="da-back" href={home} data-testid="link-back-to-store"><ArrowLeft size={16} /><span>Back to the shop</span></a>
      </header>
      <div className="da-main">
        <aside className="da-story" aria-label="About Daybook">
          <div className="da-story-content">
            <p className="da-eyebrow">A place for your plans</p>
            <h2>Make space for <em>your story.</em></h2>
            <p className="da-story-copy">A journal shaped by you, for the days worth remembering and the ones still to come.</p>
          </div>
          <div className="da-book" aria-hidden="true">
            <div className="da-book-cover"><span>Daybook</span><strong>All the days<br/>ahead.</strong><small>EST. FOR YOU</small></div>
          </div>
          <div className="da-story-footer"><span>Thoughtfully made. Entirely yours.</span><span>DAYBOOK / ACCOUNT</span></div>
        </aside>
        <section className="da-form-side" aria-labelledby="account-title">
          <div className="da-panel">
            <p className="da-overline">Your account</p>
            <h1 id="account-title" data-testid="text-account-title">{title}</h1>
            <p className="da-description">{description}</p>

            {loading ? <div role="status" aria-label="Loading your account" data-testid="status-account-loading">
              <div className="da-skeleton" style={{ width:"65%" }} /><div className="da-skeleton" /><div className="da-skeleton" />
              <span className="sr-only">Loading your account</span>
            </div> : customerQuery.isError ? <div className="da-center">
              <div className="da-round-icon"><BookOpen size={25} /></div>
              <p role="alert" data-testid="error-account-load">We couldn't load your account. Please try again.</p>
              <button type="button" className="da-secondary" onClick={() => customerQuery.refetch()} data-testid="button-retry-account">Try again</button>
            </div> : signedIn ? <div className="da-center">
              <div className="da-round-icon"><Check size={27} /></div>
              <p data-testid="text-customer-greeting">Hello, {customerQuery.data?.name}. You're signed in as <strong>{customerQuery.data?.email}</strong>.</p>
              {error && <p role="alert" className="da-alert" data-testid="error-account">{error}</p>}
              {message && <p role="status" className="da-alert" data-kind="success" data-testid="status-account">{message}</p>}
              <a href={destination} className="da-primary" style={{ textDecoration:"none" }} data-testid="link-continue-shopping">Continue to the shop <ArrowRight size={17} /></a>
              <button type="button" className="da-text-action" disabled={busy} onClick={() => { setError(""); logoutMutation.mutate(); }} data-testid="button-sign-out">{logoutMutation.isPending ? "Signing out..." : "Sign out"}</button>
            </div> : awaitingVerification ? <div className="da-center">
              <div className="da-round-icon"><Mail size={27} /></div>
              {verifyMutation.isPending ? <p role="status" data-testid="status-verifying">Verifying your email...</p> : <>
                <p>{verifyMutation.isError ? "We couldn't verify that link. You can try again or sign in with a different link." : "Checking your verification link..."}</p>
                {error && <p role="alert" className="da-alert" data-testid="error-verification">{error}</p>}
                <button type="button" className="da-secondary" disabled={busy} onClick={() => { setError(""); verifyMutation.mutate(verifyToken!); }} data-testid="button-retry-verification">Try verification again</button>
                <button type="button" className="da-text-action" onClick={() => { stripToken("verify"); setVerificationComplete(true); setError(""); }} data-testid="button-back-to-sign-in">Back to sign in</button>
              </>}
            </div> : <>
              {!changingPassword && mode !== "reset" && <div className="da-tabs" role="group" aria-label="Account access">
                <button type="button" aria-pressed={mode === "login"} className="da-tab" onClick={() => switchMode("login")} disabled={busy} data-testid="button-mode-login">Sign in</button>
                <button type="button" aria-pressed={mode === "register"} className="da-tab" onClick={() => switchMode("register")} disabled={busy} data-testid="button-mode-register">Create account</button>
              </div>}
              {error && <p role="alert" className="da-alert" data-testid="error-account">{error}</p>}
              {message && <p role="status" className="da-alert" data-kind="success" data-testid="status-account">{message}</p>}
              <form onSubmit={submit}>
                {mode === "register" && !changingPassword && <label className="da-field">Name
                  <input data-testid="input-name" type="text" value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="The name on your journal" required disabled={busy} />
                </label>}
                {!changingPassword && <label className="da-field">Email
                  <input data-testid="input-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required disabled={busy} />
                </label>}
                {(changingPassword || mode !== "reset") && <label className="da-field">{changingPassword ? "New password" : "Password"}
                  <input data-testid="input-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={changingPassword || mode === "register" ? "new-password" : "current-password"} placeholder="At least 8 characters" required minLength={8} disabled={busy} />
                </label>}
                {(mode === "register" || changingPassword) && <p className="da-hint">Use at least 8 characters to keep your account secure.</p>}
                <button type="submit" className="da-primary" disabled={busy} data-testid="button-submit-account">
                  {busy ? "Please wait..." : changingPassword ? "Update password" : mode === "register" ? "Create account" : mode === "reset" ? "Send reset instructions" : "Sign in"}
                  {!busy && <ArrowRight size={17} />}
                </button>
              </form>
              {!changingPassword && mode !== "reset" && <>
                <div className="da-divider">or</div>
                <button type="button" className="da-secondary" onClick={startGoogleSignIn} disabled={busy} data-testid="button-google-sign-in"><GoogleIcon />{googlePending ? "Waiting for Google..." : "Continue with Google"}</button>
                {googlePending && <p role="status" className="da-hint" style={{ margin:"12px 0 0", textAlign:"center" }} data-testid="status-google-sign-in">Finish signing in in the Google window.</p>}
              </>}
              {mode === "login" && !changingPassword && <button type="button" className="da-text-action" onClick={() => switchMode("reset")} disabled={busy} data-testid="button-forgot-password">Forgot password?</button>}
              {(mode === "reset" || changingPassword) && <button type="button" className="da-text-action" onClick={() => { if (changingPassword) { stripToken("reset"); setResetComplete(true); } switchMode("login"); }} disabled={busy} data-testid="button-back-to-sign-in">Back to sign in</button>}
              <div className="da-note"><ShieldCheck size={17} strokeWidth={1.8} /><span>Your account keeps your journals and plans together. Your details stay yours.</span></div>
            </>}
            {storeQuery.isError && <p role="status" className="da-hint" style={{ marginTop:24 }} data-testid="status-store-unavailable">We couldn't load the shop name right now. Your account is still available.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}