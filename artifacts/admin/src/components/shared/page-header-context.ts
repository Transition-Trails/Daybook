import { createContext } from "react";

/**
 * PageHeader uses this target when it is rendered inside AdminLayout. Keeping
 * the context here avoids coupling the shared page primitives to the shell.
 */
export const PageHeaderTargetContext = createContext<HTMLElement | null>(null);