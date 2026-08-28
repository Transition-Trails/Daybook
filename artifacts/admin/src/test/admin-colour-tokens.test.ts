import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
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

type RawColourMatch = {
  file: string;
  line: number;
  lineText: string;
  value: string;
};

type RawColourException = {
  scope: string;
  reason: string;
  value?: RegExp;
  line?: RegExp;
};

const TOKEN_EQUIVALENT_RAW_COLOURS = new Map([
  ["#4a6080", "--admin-slate"],
  ["#e7e0d7", "--admin-border"],
  ["#8a7b6a", "--admin-faint"],
  ["#7a8fa6", "--admin-muted"],
  ["#faf8f3", "--admin-card"],
  ["#fffcf8", "--admin-card-subtle"],
]);

const documentedRawColourAllowList: readonly RawColourException[] = [
  {
    scope: "components/CopilotPanel.tsx",
    reason: "Copilot uses semantic message, attachment, and generated-content colours beyond admin chrome.",
  },
  {
    scope: "components/EditorialRichText.tsx",
    reason: "The rich-text editor preserves authored document colours rather than admin chrome colours.",
  },
  {
    scope: "components/FontLibraryPicker.tsx",
    reason: "Font specimens use selection and preview colours with semantic roles.",
  },
  {
    scope: "components/PaletteLibraryPicker.tsx",
    reason: "Palette previews render authored product colours rather than admin chrome colours.",
  },
  {
    scope: "components/help/**",
    reason: "Help authoring uses semantic validation and status colours.",
  },
  {
    scope: "components/layout/**",
    reason: "Layout overlays use alpha-composited colours that do not have standalone admin tokens.",
  },
  {
    scope: "components/shared/index.tsx",
    reason: "Status backgrounds and foregrounds are paired semantic colours, not admin surface tokens.",
  },
  {
    scope: "components/shared/ClaudeHeader.tsx",
    reason: "The Claude-branded header preserves its provider-specific gradient and surface colours.",
  },
  {
    scope: "components/studio/**",
    reason: "Studio primitives contain semantic statuses and product-preview colours.",
  },
  {
    scope: "components/ui/**",
    reason: "Low-level chart and drawer primitives use semantic and alpha-composited colours.",
  },
  {
    scope: "pages/build/**",
    reason: "The build flow contains product swatches and semantic validation colours.",
  },
  {
    scope: "pages/catalog/**",
    reason: "Catalog pages render seller-authored palettes, swatches, and semantic status colours.",
  },
  {
    scope: "pages/editions/**",
    reason: "Edition authoring includes product preview and validation colours.",
  },
  {
    scope: "pages/ink/**",
    reason: "Ink library pages render user-authored pen and annotation colours.",
  },
  {
    scope: "pages/login.tsx",
    reason: "Authentication has provider and semantic error colours outside admin chrome.",
  },
  {
    scope: "pages/planners/**",
    reason: "Planner editing renders saved pen colours and document-preview colours.",
  },
  {
    scope: "pages/shop/**",
    reason: "Storefront pages use buyer-facing brand, product, and semantic status colours.",
  },
  {
    scope: "pages/store/**",
    reason: "Store tools include seller-authored product colours and semantic status palettes.",
  },
  {
    scope: "pages/studios/**",
    reason: "Studios render product palettes, previews, and semantic generation statuses.",
  },
  {
    scope: "pages/super/*.tsx",
    reason: "Platform pages use semantic analytics, billing, support, and release status colours.",
  },
  {
    scope: "pages/super/WorldSmithHome.tsx",
    reason: "WorldSmith accepts arbitrary status colours and is intentionally out of scope for this pass.",
  },
  {
    scope: "pages/super/worldsmith-editorial/**",
    reason: "Editorial tools render authored world palettes and semantic workflow statuses.",
  },
  {
    scope: "pages/unauthorized.tsx",
    reason: "The access-denied page uses semantic error colours.",
  },
  {
    scope: "pages/catalog/palettes/list.tsx",
    line: /DEFAULT_COLORS/,
    reason: "These literals are starter product palette data persisted as hex, not admin chrome.",
  },
];

function scopePattern(scope: string): RegExp {
  const normalized = scope.split(sep).join("/");
  const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const wildcarded = escaped.replaceAll("**", "\u0000").replaceAll("*", "[^/]*").replaceAll("\u0000", ".*");
  return new RegExp(`^${wildcarded}$`);
}

function rawColourMatches(): RawColourMatch[] {
  const rawColour = /#[\da-f]{3,8}\b|(?:rgb|hsl)a?\((?!\s*var\()[^)]*\)/gi;

  return files.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const fileName = relative(SRC_ROOT, file).split(sep).join("/");
    const lineStarts = [0];
    for (let index = source.indexOf("\n"); index !== -1; index = source.indexOf("\n", index + 1)) {
      lineStarts.push(index + 1);
    }

    return [...source.matchAll(rawColour)].map((match) => {
      const index = match.index ?? 0;
      let lineIndex = lineStarts.length - 1;
      while (lineStarts[lineIndex] > index) lineIndex -= 1;
      const lineStart = lineStarts[lineIndex];
      const lineEnd = source.indexOf("\n", lineStart);
      return {
        file: fileName,
        line: lineIndex + 1,
        lineText: source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd),
        value: match[0],
      };
    });
  });
}

function exceptionMatches(exception: RawColourException, match: RawColourMatch): boolean {
  return (
    scopePattern(exception.scope).test(match.file) &&
    (!exception.value || exception.value.test(match.value)) &&
    (!exception.line || exception.line.test(match.lineText))
  );
}

describe("admin colour tokens", () => {
  it("defines Slate as the shared admin secondary colour", () => {
    const css = readFileSync(join(SRC_ROOT, "index.css"), "utf8");
    expect(css).toContain("--admin-slate: #4A6080;");
  });

  it("does not hardcode a colour that has an admin token", () => {
    const failures = rawColourMatches()
      .filter(
        (match) =>
          TOKEN_EQUIVALENT_RAW_COLOURS.has(match.value.toLowerCase()) &&
          !documentedRawColourAllowList.some((exception) => exceptionMatches(exception, match)),
      )
      .map((match) => {
        const token = TOKEN_EQUIVALENT_RAW_COLOURS.get(match.value.toLowerCase());
        return `${match.file}:${match.line} ${match.value} -> var(${token})`;
      });

    expect(failures).toEqual([]);
  });

  it("has no undocumented raw colours in admin pages or components", () => {
    const matches = rawColourMatches();
    const failures = matches.filter(
      (match) => !documentedRawColourAllowList.some((exception) => exceptionMatches(exception, match)),
    );
    const breakdown = Object.entries(
      matches.reduce<Record<string, number>>((counts, match) => {
        const directory = match.file.split("/")[0];
        counts[directory] = (counts[directory] ?? 0) + 1;
        return counts;
      }, {}),
    )
      .map(([directory, count]) => `${directory}: ${count}`)
      .join(", ");

    expect(
      failures.map((match) => `${match.file}:${match.line} ${match.value}`),
      `${matches.length} raw colours scanned (${breakdown})`,
    ).toEqual([]);
  });

  it("keeps every raw-colour exception active and documented", () => {
    const matches = rawColourMatches();
    for (const exception of documentedRawColourAllowList) {
      expect(exception.scope).not.toBe("");
      expect(exception.reason).not.toBe("");
      expect(
        matches.some((match) => exceptionMatches(exception, match)),
        `Stale raw-colour exception: ${exception.scope}`,
      ).toBe(true);
    }
  });
});