/**
 * Shown when store_flags.aiEnabled is false.
 */
import { Sparkles, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

/**
 * Banner shown to super admins when a store's AI plan is off.
 * Replaces the generic AiDisabledState so they know exactly which flag to flip.
 */
export function SuperAdminAiBanner() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[360px] gap-5 text-center animate-in fade-in duration-300">
      <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-amber-600" />
      </div>
      <div className="space-y-2">
        <h2 className="font-display font-semibold text-lg text-foreground">
          AI is not enabled for this store
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          This store's AI plan is currently off. Enable it from Feature Flags so the store can access AI studios.
        </p>
        <div className="pt-1">
          <Link
            href="/super/flags"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Enable from Feature Flags
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AiDisabledState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[360px] gap-5 text-center animate-in fade-in duration-300">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
        <Sparkles className="w-7 h-7 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-display font-semibold text-lg text-foreground">
          AI studios aren't enabled for your plan
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your store doesn't have access to the AI content creation tools yet.
          Contact your platform admin or upgrade your plan to unlock Theme Studio,
          Pack Studio, Edition Studio, and Trend Research.
        </p>
      </div>
    </div>
  );
}
