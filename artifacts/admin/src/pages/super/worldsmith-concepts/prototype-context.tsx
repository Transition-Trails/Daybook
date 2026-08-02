/**
 * PROTOTYPE_DATA — WorldSmith prototype shared context.
 * Persists selected World and role to sessionStorage so navigation between
 * the three concept routes keeps the user's choices.
 */
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { Role, World } from "./seed-data";
import { WORLDS } from "./seed-data";

interface PrototypeContextValue {
  role: Role;
  setRole: (r: Role) => void;
  worldFilter: string | null; // null = "All Worlds"
  setWorldFilter: (id: string | null) => void;
  selectedWorld: World | null;
  worlds: World[];
  addWorld: (w: World) => void;
  wizardOpen: boolean;
  openWizard: () => void;
  closeWizard: () => void;
}

const PrototypeContext = createContext<PrototypeContextValue | null>(null);

const SS_ROLE_KEY = "ws-proto:role";
const SS_WORLD_KEY = "ws-proto:world";

export function WorldsmithPrototypeProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>(() => {
    try { return (sessionStorage.getItem(SS_ROLE_KEY) as Role) ?? "creative_director"; }
    catch { return "creative_director"; }
  });

  const [worldFilter, setWorldFilterState] = useState<string | null>(() => {
    try { return sessionStorage.getItem(SS_WORLD_KEY) ?? null; }
    catch { return null; }
  });

  const [worlds, setWorlds] = useState<World[]>(WORLDS);
  const [wizardOpen, setWizardOpen] = useState(false);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    try { sessionStorage.setItem(SS_ROLE_KEY, r); } catch { /* noop */ }
  }, []);

  const setWorldFilter = useCallback((id: string | null) => {
    setWorldFilterState(id);
    try {
      if (id) sessionStorage.setItem(SS_WORLD_KEY, id);
      else sessionStorage.removeItem(SS_WORLD_KEY);
    } catch { /* noop */ }
  }, []);

  const addWorld = useCallback((w: World) => {
    setWorlds(prev => [...prev, w]);
  }, []);

  // If the stored world filter no longer matches any world (e.g. after reset), clear it
  useEffect(() => {
    if (worldFilter && !worlds.find(w => w.id === worldFilter)) {
      setWorldFilterState(null);
    }
  }, [worlds, worldFilter]);

  const selectedWorld = worldFilter ? (worlds.find(w => w.id === worldFilter) ?? null) : null;

  return (
    <PrototypeContext.Provider value={{
      role, setRole,
      worldFilter, setWorldFilter,
      selectedWorld,
      worlds,
      addWorld,
      wizardOpen,
      openWizard: () => setWizardOpen(true),
      closeWizard: () => setWizardOpen(false),
    }}>
      {children}
    </PrototypeContext.Provider>
  );
}

export function usePrototype(): PrototypeContextValue {
  const ctx = useContext(PrototypeContext);
  if (!ctx) throw new Error("usePrototype must be used inside WorldsmithPrototypeProvider");
  return ctx;
}
