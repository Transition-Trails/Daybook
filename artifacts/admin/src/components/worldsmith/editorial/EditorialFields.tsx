import { createContext, useContext, useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

const INK = "var(--admin-ink, var(--admin-ink))";
const CLAY = "var(--admin-clay, var(--admin-clay))";
const BORDER = "var(--admin-border, var(--admin-border))";
const CanonVocabularyRecordType = createContext<string | undefined>(undefined);

export function CanonVocabularyRecordTypeProvider({ recordType, children }: {
  recordType: string;
  children: React.ReactNode;
}) {
  return <CanonVocabularyRecordType.Provider value={recordType}>{children}</CanonVocabularyRecordType.Provider>;
}

export function useVocabularies(worldId?: string) {
  const recordType = useContext(CanonVocabularyRecordType);
  const query = useQuery({
    queryKey: ["editorial-vocabularies", worldId],
    queryFn: () =>
      apiFetch<{ vocabularies: any[]; options: any[] }>(`/v1/editorial/vocabularies${worldId ? `?world_id=${worldId}` : ""}`),
    staleTime: 300_000,
  });
  const data = useMemo(() => {
    if (!query.data) return undefined;
    const vocabularies = query.data.vocabularies ?? [];
    const matching = vocabularies.filter(v => v.recordType == null || v.recordType === recordType);
    const scopedKeys = new Set(matching.filter(v => v.recordType === recordType && recordType).map(v => v.key));
    const effectiveVocabularies = matching.filter(v => v.recordType === recordType
      ? true
      : v.recordType == null && !scopedKeys.has(v.key));
    const vocabMap = new Map<string, { key: string; active: boolean; isWorld: boolean }>();
    effectiveVocabularies.forEach(v => vocabMap.set(v.id, {
      key: v.key,
      active: v.active !== false,
      isWorld: v.scope === "world" || (v.worldId != null && v.worldId === worldId),
    }));

    const grouped: Record<string, { key: string; label: string; group?: string; active: boolean; description?: string; version?: number; isWorld?: boolean }[]> = {};
    vocabMap.forEach(vocabulary => {
      if (!grouped[vocabulary.key]) grouped[vocabulary.key] = [];
    });
    (query.data.options ?? []).forEach(opt => {
      const parent = vocabMap.get(opt.vocabularyId);
      if (!parent) return;
      if (!grouped[parent.key]) grouped[parent.key] = [];
      grouped[parent.key].push({
        key: opt.key,
        label: opt.label,
        description: opt.description,
        version: opt.version,
        active: opt.active !== false && parent.active,
        isWorld: parent.isWorld || (opt.worldId != null && opt.worldId === worldId),
      });
    });
    // If a world-specific option shares a key with an inherited option, keep
    // the world row (including its inactive state) as the canonical choice.
    for (const key of Object.keys(grouped)) {
      const optionsByKey = new Map<string, typeof grouped[string][number]>();
      for (const option of grouped[key]) {
        const existing = optionsByKey.get(option.key);
        if (!existing || option.isWorld || !existing.isWorld) optionsByKey.set(option.key, option);
      }
      grouped[key] = [...optionsByKey.values()];
    }
    return { vocabularies: grouped };
  }, [query.data, recordType, worldId]);
  return { ...query, data };
}

function useMergedOptions(vocabKey?: string, staticOptions: { key: string; label: string; group?: string; active?: boolean; description?: string }[] = [], includeInactive = false, worldId?: string) {
  const { data } = useVocabularies(worldId);
  return useMemo(() => {
    if (!vocabKey || !data?.vocabularies || !(vocabKey in data.vocabularies)) {
      return staticOptions.filter(o => includeInactive || o.active !== false);
    }
    const remoteOptions = data.vocabularies[vocabKey] || [];
    return remoteOptions.filter(o => includeInactive || o.active !== false);
  }, [vocabKey, staticOptions, data, includeInactive]);
}

export function SingleSelect({
  value,
  onChange,
  options: staticOptions,
  vocabKey,
  placeholder = "Select...",
  allowCustom = false,
  label,
  worldId
}: {
  value: string;
  onChange: (val: string) => void;
  options: { key: string; label: string; group?: string; description?: string }[];
  vocabKey?: string;
  placeholder?: string;
  allowCustom?: boolean;
  label?: string;
  worldId?: string;
}) {
  const activeOptions = useMergedOptions(vocabKey, staticOptions, false, worldId);
  const allOptions = useMergedOptions(vocabKey, staticOptions, true, worldId);

  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    if (!isOpen) {
      if (value?.startsWith('{"key":"custom"')) {
        try { setCustomValue(JSON.parse(value).custom); } catch {}
      } else if (value && value !== "custom" && !allOptions.find(o => o.key === value)) {
        setCustomValue(value);
      } else {
        setCustomValue("");
      }
    }
  }, [isOpen, value, allOptions]);
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isCustomRaw = value && !allOptions.find(o => o.key === value) && value !== "custom" && !value.startsWith('{"key":"custom"');
  const isCustomObj = value?.startsWith('{"key":"custom"');
  
  const selectedOption = isCustomRaw || isCustomObj 
    ? { key: "custom", label: isCustomObj ? JSON.parse(value).custom : value } 
    : allOptions.find(o => o.key === value) || (value ? { key: value, label: value } : null);

  const SPECIAL_STATES = ["unknown", "unresolved", "not_applicable", "withheld"];

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && <label className="block text-[11px] font-semibold mb-1.5" style={{ color: INK }}>{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white border rounded-lg hover:border-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
        style={{ borderColor: BORDER, color: selectedOption ? INK : "var(--admin-muted)" }}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
      
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg overflow-hidden flex flex-col max-h-64" style={{ borderColor: BORDER }}>
          <div className="overflow-y-auto p-1">
            {activeOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md hover:bg-gray-50 text-left ${value === opt.key ? 'bg-gray-50 font-medium' : ''}`}
                style={{ 
                  color: SPECIAL_STATES.includes(opt.key) ? "var(--admin-muted)" : INK,
                  fontStyle: SPECIAL_STATES.includes(opt.key) ? "italic" : "normal"
                }}
                onClick={() => {
                  onChange(opt.key);
                  setIsOpen(false);
                }}
                title={opt.description}
              >
                <span>{opt.label}</span>
                {value === opt.key && <Check className="w-3.5 h-3.5 text-[var(--admin-clay)]" />}
              </button>
            ))}
          </div>
          {allowCustom && (
            <div className="p-2 border-t bg-gray-50 flex gap-2" style={{ borderColor: BORDER }}>
              <input
                type="text"
                className="flex-1 px-2 py-1 text-sm border rounded bg-white outline-none focus:border-[var(--admin-clay)]"
                placeholder="Custom value..."
                value={customValue}
                onChange={e => setCustomValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && customValue.trim()) {
                    e.preventDefault();
                    onChange(JSON.stringify({ key: "custom", custom: customValue.trim() }));
                    setIsOpen(false);
                  }
                }}
              />
              <button
                type="button"
                className="px-2 py-1 text-xs font-medium text-white rounded bg-[var(--admin-ink)] hover:opacity-90"
                onClick={() => {
                  if (customValue.trim()) {
                    onChange(JSON.stringify({ key: "custom", custom: customValue.trim() }));
                    setIsOpen(false);
                  }
                }}
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MultiChipSelect({
  values = [],
  onChange,
  options: staticOptions,
  vocabKey,
  placeholder = "Select...",
  allowCustom = false,
  max,
  label,
  worldId
}: {
  values: string[];
  onChange: (vals: string[]) => void;
  options: { key: string; label: string; group?: string; description?: string }[];
  vocabKey?: string;
  placeholder?: string;
  allowCustom?: boolean;
  max?: number;
  label?: string;
  worldId?: string;
}) {
  const activeOptions = useMergedOptions(vocabKey, staticOptions, false, worldId);
  const allOptions = useMergedOptions(vocabKey, staticOptions, true, worldId);

  const [isOpen, setIsOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = (key: string) => {
    if (values.includes(key)) {
      onChange(values.filter(v => v !== key));
    } else {
      if (max && values.length >= max) {
        return;
      }
      onChange([...values, key]);
    }
  };

  const selectedLabels = values.map(v => {
    const isCustomObj = v?.startsWith('{"key":"custom"');
    if (isCustomObj) return JSON.parse(v).custom;
    const opt = allOptions.find(o => o.key === v);
    return opt ? opt.label : v;
  });

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-[11px] font-semibold" style={{ color: INK }}>{label}</label>
          {max && <span className="text-[10px] text-gray-500">Max {max}</span>}
        </div>
      )}
      
      <div 
        className="w-full flex flex-wrap gap-1.5 px-2.5 py-1.5 text-sm bg-white border rounded-lg hover:border-gray-400 transition-colors focus-within:ring-2 focus-within:ring-[var(--admin-clay)]/20 min-h-[38px] cursor-text"
        style={{ borderColor: BORDER }}
        onClick={() => setIsOpen(true)}
      >
        {values.length === 0 && (
          <span className="text-gray-400 self-center px-1">{placeholder}</span>
        )}
        {values.map((val, idx) => (
          <span key={val} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-[var(--admin-ink)]">
            {selectedLabels[idx]}
            <button 
              type="button"
              className="text-gray-400 hover:text-gray-700"
              onClick={(e) => { e.stopPropagation(); handleToggle(val); }}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg overflow-hidden flex flex-col max-h-64" style={{ borderColor: BORDER }}>
          <div className="overflow-y-auto p-1 flex flex-col">
            {activeOptions.map((opt) => {
              const isSelected = values.includes(opt.key);
              const isDisabled = !isSelected && max && values.length >= max;
              return (
                <label 
                  key={opt.key}
                  className={`flex flex-col px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={opt.description}
                >
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      disabled={Boolean(isDisabled)}
                      onChange={() => handleToggle(opt.key)}
                      className="rounded border-gray-300 text-[var(--admin-clay)] focus:ring-[var(--admin-clay)]"
                    />
                    <span style={{ color: INK }} className="text-sm font-medium">{opt.label}</span>
                  </div>
                  {opt.description && <span className="ml-5 text-[10px] text-gray-500">{opt.description}</span>}
                </label>
              );
            })}
          </div>
          {allowCustom && (
             <div className="p-2 border-t bg-gray-50 flex gap-2" style={{ borderColor: BORDER }}>
             <input
               type="text"
               className="flex-1 px-2 py-1 text-sm border rounded bg-white outline-none focus:border-[var(--admin-clay)]"
               placeholder="Custom value..."
               value={customValue}
               onChange={e => setCustomValue(e.target.value)}
               disabled={max !== undefined && values.length >= max}
               onKeyDown={e => {
                 if (e.key === "Enter" && customValue.trim()) {
                   e.preventDefault();
                   if (!max || values.length < max) {
                     handleToggle(JSON.stringify({ key: "custom", custom: customValue.trim() }));
                     setCustomValue("");
                   }
                 }
               }}
             />
             <button
               type="button"
               disabled={max !== undefined && values.length >= max}
               className="px-2 py-1 text-xs font-medium text-white rounded bg-[var(--admin-ink)] hover:opacity-90 disabled:opacity-50"
               onClick={() => {
                 if (customValue.trim() && (!max || values.length < max)) {
                   handleToggle(JSON.stringify({ key: "custom", custom: customValue.trim() }));
                   setCustomValue("");
                 }
               }}
             >
               Add
             </button>
           </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CanonPicker({
  worldId,
  value,
  onChange,
  label,
  placeholder = "Search canon...",
  canonType
}: {
  worldId: string;
  value: string;
  onChange: (val: string) => void;
  label?: string;
  placeholder?: string;
  canonType?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: recordsData } = useQuery({
    queryKey: ["editorial-canon-records", worldId, canonType],
    queryFn: () => apiFetch<{ canon_records: any[] }>(`/v1/editorial/canon-records?world_id=${worldId}&limit=100`),
    enabled: !!worldId && isOpen,
    staleTime: 60_000,
  });
  
  const records = (recordsData?.canon_records ?? []).filter(r => !canonType || r.canonType === canonType);
  const selectedRecord = value ? { id: value, name: value } : null; // Will just display ID if not loaded
  const filtered = records.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && <label className="block text-[11px] font-semibold mb-1.5" style={{ color: INK }}>{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white border rounded-lg hover:border-gray-400 transition-colors focus:outline-none"
        style={{ borderColor: BORDER, color: selectedRecord || value ? INK : "var(--admin-muted)" }}
      >
        <span className="truncate">
          {records.find(r => r.id === value)?.name || selectedRecord?.name || placeholder}
        </span>
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg overflow-hidden flex flex-col max-h-64" style={{ borderColor: BORDER }}>
          <div className="p-2 border-b bg-gray-50" style={{ borderColor: BORDER }}>
            <input
              type="text"
              autoFocus
              className="w-full px-2 py-1.5 text-sm border rounded bg-white outline-none focus:border-[var(--admin-clay)]"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-y-auto p-1">
            {filtered.map(r => (
              <button
                key={r.id}
                type="button"
                className={`w-full flex flex-col px-2 py-1.5 rounded-md hover:bg-gray-50 text-left ${value === r.id ? 'bg-gray-50' : ''}`}
                onClick={() => {
                  onChange(r.id);
                  setIsOpen(false);
                }}
              >
                <span className="text-sm font-medium" style={{ color: INK }}>{r.name}</span>
                {r.canonType && <span className="text-[10px] text-gray-500 capitalize">{r.canonType}</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="p-3 text-xs text-center text-gray-500">No records found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function StructuredRepeater<T extends Record<string, any>>({
  items,
  onChange,
  renderItem,
  defaultNewItem,
  addButtonLabel = "Add item"
}: {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, index: number, update: (data: Partial<T>) => void, remove: () => void) => React.ReactNode;
  defaultNewItem: () => T;
  addButtonLabel?: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="relative group border rounded-xl p-4 bg-gray-50/50" style={{ borderColor: BORDER }}>
          <button 
            type="button"
            className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 rounded bg-white border opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ borderColor: BORDER }}
            onClick={() => onChange(items.filter((_, i) => i !== idx))}
          >
            <X className="w-4 h-4" />
          </button>
          {renderItem(
            item, 
            idx, 
            (data) => {
              const newItems = [...items];
              newItems[idx] = { ...newItems[idx], ...data };
              onChange(newItems);
            },
            () => {
              onChange(items.filter((_, i) => i !== idx));
            }
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, defaultNewItem()])}
        className="flex items-center gap-1.5 text-xs font-semibold hover:underline bg-white border px-3 py-1.5 rounded-lg"
        style={{ color: CLAY, borderColor: BORDER }}
      >
        <Plus className="w-3.5 h-3.5" />
        {addButtonLabel}
      </button>
    </div>
  );
}