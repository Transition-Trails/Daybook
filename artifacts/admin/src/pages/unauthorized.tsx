import { Link } from "wouter";
import { BookMarked, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Unauthorized() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ background: "hsl(35 52% 94%)" }}
    >
      <div className="flex flex-col items-center text-center max-w-sm">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: "hsl(221 46% 17%)" }}
        >
          <ShieldOff className="w-8 h-8 text-[#C87560]" />
        </div>
        <h1 className="font-display text-2xl font-semibold mb-2" style={{ color: "hsl(221 46% 17%)" }}>
          Not authorised
        </h1>
        <p className="text-sm mb-8" style={{ color: "hsl(216 15% 46%)" }}>
          Your account doesn't have access to the admin console. If you believe this is a mistake, ask your store owner to invite you.
        </p>
        <div className="flex gap-3">
          <Button
            asChild
            variant="outline"
            style={{ borderColor: "hsl(37 37% 82%)" }}
          >
            <Link href="/login">Sign in with a different account</Link>
          </Button>
        </div>
        <div className="mt-12 flex items-center gap-2 opacity-40">
          <BookMarked className="w-4 h-4" style={{ color: "hsl(221 46% 17%)" }} />
          <span className="text-xs font-medium" style={{ color: "hsl(221 46% 17%)" }}>Daybook Studio</span>
        </div>
      </div>
    </div>
  );
}
