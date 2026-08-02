/**
 * PROTOTYPE_DATA — per-concept feedback panel.
 * Non-production only. Stores feedback in localStorage keyed by concept.
 */
import { useState, useEffect } from "react";
import { MessageSquare, ChevronDown, ChevronUp, Star } from "lucide-react";

interface FeedbackData {
  worksWell: string;
  unclear: string;
  missing: string;
  preferred: string;
  rating: number;
}

const DEFAULT: FeedbackData = { worksWell: "", unclear: "", missing: "", preferred: "", rating: 0 };

function loadFeedback(key: string): FeedbackData {
  try {
    const raw = localStorage.getItem(`ws-proto:feedback:${key}`);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : { ...DEFAULT };
  } catch { return { ...DEFAULT }; }
}

function saveFeedback(key: string, data: FeedbackData) {
  try { localStorage.setItem(`ws-proto:feedback:${key}`, JSON.stringify(data)); } catch { /* noop */ }
}

interface FeedbackPanelProps {
  conceptKey: "command-center" | "world-gallery" | "guided-workspace";
  conceptName: string;
}

export function FeedbackPanel({ conceptKey, conceptName }: FeedbackPanelProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<FeedbackData>(() => loadFeedback(conceptKey));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(loadFeedback(conceptKey));
  }, [open, conceptKey]);

  const update = (field: keyof FeedbackData, value: string | number) => {
    setData(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveFeedback(conceptKey, data);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasFeedback = data.worksWell || data.unclear || data.missing || data.preferred || data.rating > 0;

  return (
    <div
      className="border border-border rounded-xl overflow-hidden"
      style={{ background: "hsl(35 40% 97%)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
        aria-expanded={open}
      >
        <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-[12.5px] font-medium text-foreground">
          Prototype feedback — {conceptName}
        </span>
        {hasFeedback && (
          <span className="text-[10.5px] text-[#C87560] font-medium border border-[#C87560]/30 bg-[#C87560]/8 rounded-full px-2 py-0.5">
            {data.rating > 0 ? `${data.rating}★` : "Draft"}
          </span>
        )}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          PROTOTYPE ONLY
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/60">
          <div className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <FeedbackField
              label="What works well"
              value={data.worksWell}
              onChange={v => update("worksWell", v)}
              placeholder="Information hierarchy, speed of scanning, navigation…"
            />
            <FeedbackField
              label="What feels unclear"
              value={data.unclear}
              onChange={v => update("unclear", v)}
              placeholder="Labels, statuses, actions that confused me…"
            />
            <FeedbackField
              label="Information that is missing"
              value={data.missing}
              onChange={v => update("missing", v)}
              placeholder="Data or context I expected but didn't find…"
            />
            <FeedbackField
              label="Preferred elements"
              value={data.preferred}
              onChange={v => update("preferred", v)}
              placeholder="Specific components or patterns I'd want in production…"
            />
          </div>

          {/* Rating */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
              Overall rating
            </p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => update("rating", data.rating === n ? 0 : n)}
                  className="transition-colors"
                  aria-label={`Rate ${n} star${n !== 1 ? "s" : ""}`}
                >
                  <Star
                    className="w-5 h-5"
                    fill={n <= data.rating ? "#C87560" : "none"}
                    stroke={n <= data.rating ? "#C87560" : "hsl(var(--border))"}
                  />
                </button>
              ))}
              {data.rating > 0 && (
                <span className="ml-2 text-[11.5px] text-muted-foreground">
                  {["", "Needs work", "Below expectations", "Meets expectations", "Strong concept", "Preferred option"][data.rating]}
                </span>
              )}
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Feedback saved locally to this browser — not sent anywhere.
            </p>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: saved ? "#22c55e" : "#C87560" }}
            >
              {saved ? "Saved ✓" : "Save feedback"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FeedbackField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1.5">
        {label}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground/30 transition-colors resize-none"
      />
    </div>
  );
}
