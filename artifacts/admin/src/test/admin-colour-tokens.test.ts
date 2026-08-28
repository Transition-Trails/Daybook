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
    scope: "pages/super/worldsmith-editorial/**",
    reason: "Editorial tools render authored world palettes and semantic workflow statuses.",
  },
  {
    scope: "pages/unauthorized.tsx",
    reason: "The access-denied page uses semantic error colours.",
  },
];

const exceptionFingerprints: Readonly<Record<string, string>> = {
  "components/CopilotPanel.tsx": "87a2412a0c7b0ea8971a52ef1dace6b2c4e6fe81121fc4a6d244e566f5ffa562",
  "components/EditorialRichText.tsx": "8618e0fd53a85254cf88c1babc9a12211c00e2bb1642958d0e5658f80f029845",
  "components/FontLibraryPicker.tsx": "5ba7fcbfd02481c4b48b847d470d5e30aed563b3458083f539c9207bb6a4705b",
  "components/PaletteLibraryPicker.tsx": "f0165c99ecb8d466f01bbf899d7ec0e4cd1f9003fa42d53dc427ed71431ac2a3",
  "components/help/**": "d90f4b0f38717752ceb25d2cad7a89842af5a55248e778b968ae9879381e206b",
  "components/layout/**": "068e3ec5e547ca73a38627f980c283d11bb5269225ed506206be0ebdb2860cfb",
  "components/shared/index.tsx": "62fb6848ade487398bab7ff26768b985bda3019e5b52ef8cb9d005d3b3ed74c6",
  "components/shared/ClaudeHeader.tsx": "bc398b8e25ea096c3ecce65d1eaead79a02a8c3a537bf8d31d84a69eae71b804",
  "components/studio/**": "e07b2781fce436e02e924bb63acc9d3edc40214f9b50ae644628710f11cef6e3",
  "components/ui/**": "c53d63dfb045ddb756de6b4854be2b2f22de11a3add581dd81451ee3377f25fb",
  "pages/build/**": "fd75b704ffc371239fe6dfa60694e920e334a8a5df3701d91325f03364a59890",
  "pages/catalog/**": "22d4d90c49d001431c43e74c016daf7885689922d8711911b8bcb9992723c816",
  "pages/editions/**": "9e497867444f2d0a0ec83a40b6688e5a194098db7e3e386effedc4e2e699b770",
  "pages/ink/**": "2fd485580df0e1e8b66f98a6d8ad60b2bfebf6ef9c81306ca637ffda241f6aba",
  "pages/login.tsx": "edc73ed2ff7c303891ee3002ec7aa9a4cc5ebf7f1323b93408cee38923e5caf9",
  "pages/planners/**": "06f166e7903fca2030548002d6d8a0af6153bd0a69b1515b03644d351efe108b",
  "pages/shop/**": "2c0f467bff653904db93edb11be46400601adc46706037a807487e3fa6774cea",
  "pages/store/**": "8686d1ffd54eba9d9ad4cd9c4748e48c32232a7b06e050efe28bc46ae9a94474",
  "pages/studios/**": "208c05b7446160413051bf62b968ff52568a265fada4df368062fd7cbc33ee4b",
  "pages/super/*.tsx": "86607ea41b15def50d43014235a952b2568a46c6804d78a01f2bf9c21b4a15de",
  "pages/super/worldsmith-editorial/**": "5fced22a127351fafaaa0e0502e5a0cd94b27c9f30420e426c15273dbeb00a27",
  "pages/unauthorized.tsx": "5c25bf76636602c123745ba6a8a3a2adf5fbd0539430d2bed52e6e54380fb7b8",
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
                `${match.file}:${match.value.toLowerCase()}:${match.lineText.trim()}`,
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