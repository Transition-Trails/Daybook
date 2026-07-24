/**
 * Shown when store_flags.aiEnabled is false.
 */
import { Sparkles } from "lucide-react";

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
