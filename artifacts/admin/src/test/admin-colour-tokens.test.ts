import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNED_ROOTS = ["pages", "components", "contexts", "hooks", "lib"] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const files = [
  join(SRC_ROOT, "App.tsx"),
  ...SCANNED_ROOTS.flatMap((directory) => sourceFiles(join(SRC_ROOT, directory))),
];

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
];

const exceptionFingerprints: Readonly<Record<string, string>> = {
  "components/CopilotPanel.tsx": "d965262ae9774a5af9c2500a7a34c7b576902a8e4f0e6f9f868ca565e59619c3",
  "components/EditorialRichText.tsx": "25eae0264f2543206acb316280c91aa28fa42159553db199459463f7b26071f6",
  "components/FontLibraryPicker.tsx": "ff7ec7dc56c7411aaf2f9f9a2e9146fd7d3243939079d2b24eba899040e7e15d",
  "components/PaletteLibraryPicker.tsx": "26ef5d1e52c67b352a2e0bfd3f8030a133aa1d73dd85cad65dc3419560aa8c02",
  "components/help/**": "fcaa54290f1929804f58ab95339806b536a9ac3b2ed01e7a567ed4cd6b02b978",
  "components/layout/**": "8568924cab83a85f62875ae6004d5b8847f2fc01004f4cc914cf727caa706c18",
  "components/shared/index.tsx": "a14e6b389c3d84a494bcef2a5dccfc18529830d844fcb40e0ec8aaafcf0e4b1f",
  "components/shared/ClaudeHeader.tsx": "9a8b983f80303dd45eb23c41d3627264a26d78462e0a265fc987e647f3e3a94e",
  "components/studio/**": "59cc8279603d79645603a4a73a01892e4c66d3f13a1604c7db86b7c39ec18122",
  "components/ui/**": "d129b82c77ada1ce108bd34e0a6c76b87968b410a8e33de113f165afab57a130",
  "pages/build/**": "cde09558886f01118a7d7ce1699a88ec8b5025a7cb700aab1601549e34a34a9d",
  "pages/catalog/**": "8215bbad0c676ede632ebe24d38807750fe45ac8a4e0ef1b942cc679f7ac9841",
  "pages/editions/**": "d4f58a6ddec004d313b9525f959773ba99ad09680f4f28694ec3caa82527ab8f",
  "pages/ink/**": "14cdb093c2dda3e50f6f32e5f44040ca6a4c4711f48bb59a2cee42e99c3bcc54",
  "pages/login.tsx": "e239e86284b99f392839dc031346a28dad1f6e20bd170e90172cd6610bf58abb",
  "pages/planners/**": "77d2a90dbbc1e3b882f8190942ae6e9882eff01bf07855d3027eafc4cd6c7cb0",
  "pages/shop/**": "ff570a7bbf7f1100726c09b917b370a2f8ac3d6cb64222985f694fbce7ece846",
  "pages/store/**": "68d3c38501be0e84df366c63e196960b331c133a53a2dafb09eb26052cbaaa32",
  "pages/studios/**": "eaa989d69757d6f1c1957f4d9f97f4ca98dce02e6340523baf2fd18be7290a10",
  "pages/super/*.tsx": "cc4cb43cb9960e1e6f37d9c0bb5ce0396a9bc247f05313b34f96cbda96fb0bd1",
  "pages/super/WorldSmithHome.tsx": "6d27f66e6b1fdfe607632a064853e0a09da17ed8f798cd063b57d60270b43fd2",
  "pages/super/worldsmith-editorial/**": "a235ef7977b42066daf4b4f25c13d38402989f8db63f484288d6f80e6744d2c7",
  "pages/unauthorized.tsx": "41c929b6345aa5101259cd8e1c05ee0fb8f8757547098c97240a33897b2c8032",
};

function scopePattern(scope: string): RegExp {
  const normalized = scope.split(sep).join("/");
  const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const wildcarded = escaped.replaceAll("**", "\u0000").replaceAll("*", "[^/]*").replaceAll("\u0000", ".*");
  return new RegExp(`^${wildcarded}$`);
}

function rawColourMatches(): RawColourMatch[] {
  const rawColour = /(?<!&)#[\da-f]{3,8}\b|(?:rgb|hsl)a?\((?!\s*var\()[^)]*\)/gi;

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
      .filter((match) => TOKEN_EQUIVALENT_RAW_COLOURS.has(match.value.toLowerCase()))
      .map((match) => {
        const token = TOKEN_EQUIVALENT_RAW_COLOURS.get(match.value.toLowerCase());
        return `${match.file}:${match.line} ${match.value} -> var(${token})`;
      });

    expect(failures).toEqual([]);
  });

  it("has no undocumented raw colours in admin pages or components", () => {
    const matches = rawColourMatches();
    const failures = matches.filter(
      (match) =>
        TOKEN_EQUIVALENT_RAW_COLOURS.has(match.value.toLowerCase()) ||
        !documentedRawColourAllowList.some((exception) => exceptionMatches(exception, match)),
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

  it("keeps every raw-colour exception active, documented, and exact", () => {
    const matches = rawColourMatches();
    for (const exception of documentedRawColourAllowList) {
      expect(exception.scope).not.toBe("");
      expect(exception.reason).not.toBe("");
      expect(
        matches.some((match) => exceptionMatches(exception, match)),
        `Stale raw-colour exception: ${exception.scope}`,
      ).toBe(true);
      const fingerprint = createHash("sha256")
        .update(
          matches
            .filter((match) => exceptionMatches(exception, match))
            .map(
              (match) =>
                `${match.file}:${match.line}:${match.value.toLowerCase()}:${match.lineText.trim()}`,
            )
            .sort()
            .join("\n"),
        )
        .digest("hex");
      expect(
        fingerprint,
        `Raw-colour exception changed; narrow or deliberately update: ${exception.scope}`,
      ).toBe(exceptionFingerprints[exception.scope]);
    }
  });
});