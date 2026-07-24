import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useStaffLogin } from "@workspace/api-client-react";
import { Loader2, BookMarked } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form, FormControl, FormField, FormItem, FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

const loginSchema = z.object({
  email:    z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useStaffLogin();

  function handleGoogleSignIn() {
    const w = 500, h = 620;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(
      "/api/auth/google",
      "daybook-google-auth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`,
    );
    function onMessage(ev: MessageEvent) {
      if (ev.data?.type === "daybook:auth_success") {
        window.removeEventListener("message", onMessage);
        popup?.close();
        // Hard reload so React Query's stale 401 cache is cleared and
        // the app re-fetches /auth/me with the new session cookie.
        window.location.href = "/";
      }
    }
    window.addEventListener("message", onMessage);
    const timer = setInterval(() => {
      if (popup?.closed) { clearInterval(timer); window.removeEventListener("message", onMessage); }
    }, 500);
  }

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(data: z.infer<typeof loginSchema>) {
    loginMutation.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Welcome back", description: "Signed in successfully." });
        setLocation("/");
      },
      onError: (err) => {
        toast({ title: "Sign-in failed", description: err.message || "Check your credentials and try again.", variant: "destructive" });
      },
    });
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ background: "hsl(35 52% 94%)" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 shadow-md"
            style={{ background: "hsl(221 46% 17%)" }}
          >
            <BookMarked className="w-7 h-7 text-[#C87560]" />
          </div>
          <h1 className="font-display text-3xl font-semibold" style={{ color: "hsl(221 46% 17%)" }}>
            Daybook Studio
          </h1>
          <p className="text-sm mt-2" style={{ color: "hsl(216 15% 46%)" }}>
            Sign in to your admin console
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-8 shadow-sm"
          style={{
            background: "hsl(40 100% 99%)",
            borderColor: "hsl(37 37% 85%)",
          }}
        >
          {/* Google */}
          <Button
            type="button"
            variant="outline"
            className="w-full flex items-center gap-2 mb-6 h-10"
            style={{ borderColor: "hsl(37 37% 82%)", background: "hsl(35 52% 97%)" }}
            onClick={handleGoogleSignIn}
          >
            <GoogleIcon />
            Sign in with Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" style={{ borderColor: "hsl(37 37% 88%)" }} />
            </div>
            <div className="relative flex justify-center text-xs">
              <span
                className="px-3"
                style={{ background: "hsl(40 100% 99%)", color: "hsl(216 15% 55%)" }}
              >
                or continue with email
              </span>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <Label className="text-sm" style={{ color: "hsl(221 46% 20%)" }}>Email</Label>
                    <FormControl>
                      <Input
                        placeholder="you@daybook.com"
                        style={{ borderColor: "hsl(37 37% 82%)", background: "hsl(35 52% 97%)" }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <Label className="text-sm" style={{ color: "hsl(221 46% 20%)" }}>Password</Label>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        style={{ borderColor: "hsl(37 37% 82%)", background: "hsl(35 52% 97%)" }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-10 mt-2 font-medium"
                style={{ background: "hsl(12 49% 58%)", color: "#fff" }}
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                )}
                Sign in
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "hsl(216 15% 55%)" }}>
          Access is restricted to authorised staff and store admins.
        </p>
      </div>
    </div>
  );
}
