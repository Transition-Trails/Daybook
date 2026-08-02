import { useState, useRef, useEffect } from "react";
import { Globe, ChevronDown, Search, X, ExternalLink } from "lucide-react";
import type { World } from "../seed-data";
import { usePrototype } from "../prototype-context";
import { WorldHealthChip } from "./WorldHealthChip";

interface WorldSelectorProps {
  compact?: boolean;
}

export function WorldSelector({ compact }: WorldSelectorProps) {
  const { worlds, worldFilter, setWorldFilter, selectedWorld } = usePrototype();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filtered = worlds.filter(w =>
    !query || w.name.toLowerCase().includes(query.toLowerCase()) ||
    w.code.toLowerCase().includes(query.toLowerCase())
  );

  const label = selectedWorld ? selectedWorld.name : "All Worlds";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={[
          "flex items-center gap-2 rounded-lg border border-border bg-card transition-colors",
          "hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          compact ? "px-2.5 py-1.5 text-[12px]" : "px-3 py-2 text-sm",
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`World filter: ${label}`}
      >
        <Globe className={compact ? "w-3.5 h-3.5 text-muted-foreground" : "w-4 h-4 text-muted-foreground"} />
        <span className="font-medium text-foreground max-w-[140px] truncate">{label}</span>
        {worldFilter && (
          <button
            onClick={e => { e.stopPropagation(); setWorldFilter(null); }}
            className="hover:text-foreground text-muted-foreground"
            aria-label="Clear world filter"
          >
            <X className="w-3 h-3" />
          </button>
        )}
        <ChevronDown className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-64 rounded-xl border border-border bg-card shadow-lg z-50 overflow-hidden"
          role="listbox"
          aria-label="Select world"
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search worlds…"
              className="flex-1 text-[12.5px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
              aria-label="Search worlds"
            />
            {query && <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
          </div>

          {/* All Worlds option */}
          <button
            onClick={() => { setWorldFilter(null); setOpen(false); setQuery(""); }}
            className={[
              "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-border/50",
              !worldFilter ? "bg-muted/40" : "hover:bg-muted/20",
            ].join(" ")}
            role="option"
            aria-selected={!worldFilter}
          >
            <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className={`text-[13px] font-medium ${!worldFilter ? "text-foreground" : "text-foreground/80"}`}>All Worlds</span>
          </button>

          {/* Individual worlds */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-muted-foreground text-center">No worlds match "{query}"</p>
            ) : (
              filtered.map(w => (
                <WorldOption
                  key={w.id}
                  world={w}
                  selected={worldFilter === w.id}
                  onSelect={() => { setWorldFilter(w.id); setOpen(false); setQuery(""); }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WorldOption({ world, selected, onSelect }: { world: World; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={[
        "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
        selected ? "bg-muted/40" : "hover:bg-muted/20",
      ].join(" ")}
      role="option"
      aria-selected={selected}
    >
      {/* Color swatch */}
      <span
        className="w-4 h-4 rounded-full shrink-0 border border-white/20"
        style={{ background: world.coverColor }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-foreground truncate">{world.name}</p>
        <p className="text-[10.5px] text-muted-foreground">{world.code} · {world.status === "in_setup" ? "In setup" : world.currentVolume ?? "Active"}</p>
      </div>
      <WorldHealthChip health={world.health} />
    </button>
  );
}
