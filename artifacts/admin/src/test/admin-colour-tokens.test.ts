import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNED_ROOTS = ["pages", "components"] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const files = SCANNED_ROOTS.flatMap((directory) => sourceFiles(join(SRC_ROOT, directory)));

const documentedRawColourAllowList = [
  {
    scope: "rgba(255,255,255,...) sidebar overlays",
    reason: "Opacity is composited over Ink Navy and is not a standalone brand colour.",
  },
  {
    scope: "components/shared/index.tsx semantic pill pairs",
    reason: "Status backgrounds and foregrounds are paired semantic colours, not admin surface tokens.",
  },
  {
    scope: "pages/super/WorldSmithHome.tsx status palette",
    reason: "WorldSmith accepts arbitrary status colours and is intentionally out of scope for this pass.",
  },
] as const;

describe("admin colour tokens", () => {
  it("defines Slate as the shared admin secondary colour", () => {
    const css = readFileSync(join(SRC_ROOT, "index.css"), "utf8");
    expect(css).toContain("--admin-slate: #4A6080;");
  });

  it("does not declare raw paper, border, or muted design constants", () => {
    const rawDesignConstant =
      /const\s+(?:PAPER(?:_TINT)?|BORDER|MUTED)\s*=\s*["'`](?:#[\da-f]{3,8}|hsla?\([^)]*\)|rgba?\([^)]*\))["'`]/gi;
    const failures = files.flatMap((file) => {
      const matches = [...readFileSync(file, "utf8").matchAll(rawDesignConstant)];
      return matches.map((match) => `${relative(SRC_ROOT, file)}: ${match[0]}`);
    });

    expect(failures).toEqual([]);
  });

  it("does not restore the cool-grey recipe copy literals", () => {
    const recipes = readFileSync(join(SRC_ROOT, "pages/super/ProductRecipes.tsx"), "utf8");
    expect(recipes).not.toContain("hsl(216 15% 52%)");
    expect(recipes).toContain("color: MUTED");
  });

  it("keeps every raw-colour exception documented with a reason", () => {
    for (const exception of documentedRawColourAllowList) {
      expect(exception.scope).not.toBe("");
      expect(exception.reason).not.toBe("");
    }
  });
});