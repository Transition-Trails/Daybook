import type { Role } from "../seed-data";
import { ROLE_LABELS } from "../seed-data";
import { usePrototype } from "../prototype-context";

const ROLES: Role[] = ["creative_director", "store_end_user", "daybook_admin"];

const ROLE_DETAIL: Record<Role, string> = {
  creative_director: "Reviews, visuals & production direction",
  store_end_user: "Products, releases & approved assets",
  daybook_admin: "Integrations, setup & operations",
};

interface RoleSwitcherProps {
  mode?: "pills" | "dropdown";
  label?: boolean;
}

export function RoleSwitcher({ mode = "pills", label = true }: RoleSwitcherProps) {
  const { role, setRole } = usePrototype();

  if (mode === "dropdown") {
    return (
      <div className="flex items-center gap-2">
        {label && <span className="text-[11px] text-muted-foreground">Viewing as</span>}
        <select
          value={role}
          onChange={e => setRole(e.target.value as Role)}
          className="h-7 rounded-md border border-border bg-card px-2 text-[12px] font-medium text-foreground outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          aria-label="Switch viewing role"
        >
          {ROLES.map(r => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1.5">
          Prototype role
        </p>
      )}
      <div
        className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5"
        role="radiogroup"
        aria-label="Select prototype role"
      >
        {ROLES.map(r => {
          const active = role === r;
          return (
            <button
              key={r}
              onClick={() => setRole(r)}
              role="radio"
              aria-checked={active}
              className={[
                "px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-all",
                active
                  ? "bg-[#1B2A4A] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {ROLE_LABELS[r]}
            </button>
          );
        })}
      </div>
      {label && (
        <p className="mt-1 text-[10.5px] text-muted-foreground">{ROLE_DETAIL[role]}</p>
      )}
    </div>
  );
}
