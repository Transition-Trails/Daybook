export const STARTER_SHAPE_RECIPES = [
  {
    id: "shr_starter_classic_ribbon",
    origin: "starter" as const,
    authoredByStoreId: null,
    name: "Classic ribbon",
    slug: "classic-ribbon",
    functionType: "banner",
    aspectRatio: 3,
    defaultSizeMm: 60,
    takesLabel: true,
    status: "live" as const,
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120mm" height="40mm">
  <polygon points="0,8 24,8 24,32 0,32 10,20" fill="{{accent}}"/>
  <polygon points="96,8 120,8 110,20 120,32 96,32" fill="{{accent}}"/>
  <rect x="18" y="4" width="84" height="32" fill="{{primary}}"/>
  <text x="60" y="25" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="{{labelFontSize}}" fill="#FFFFFF">{{label}}</text>
  <path data-name="cutline" d="M0 8 L18 8 L24 0 L96 0 L102 8 L120 8 L110 20 L120 32 L102 32 L96 40 L24 40 L18 32 L0 32 L10 20 Z" fill="none" stroke="none"/>
</svg>`,
  },
  {
    id: "shr_starter_pennant",
    origin: "starter" as const,
    authoredByStoreId: null,
    name: "Pennant banner",
    slug: "pennant",
    functionType: "banner",
    aspectRatio: 3,
    defaultSizeMm: 60,
    takesLabel: true,
    status: "live" as const,
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120mm" height="40mm">
  <path d="M0 0 H120 L102 20 L120 40 H0 Z" fill="{{primary}}"/>
  <path d="M0 0 H8 V40 H0 Z" fill="{{accent}}"/>
  <text x="55" y="25" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="{{labelFontSize}}" fill="#FFFFFF">{{label}}</text>
  <path data-name="cutline" d="M0 0 L120 0 L102 20 L120 40 L0 40 Z" fill="none" stroke="none"/>
</svg>`,
  },
  {
    id: "shr_starter_scalloped",
    origin: "starter" as const,
    authoredByStoreId: null,
    name: "Scalloped banner",
    slug: "scalloped",
    functionType: "banner",
    aspectRatio: 3,
    defaultSizeMm: 60,
    takesLabel: true,
    status: "live" as const,
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120mm" height="40mm">
  <path d="M0 0 H120 V32 C115 42 105 42 100 32 C95 42 85 42 80 32 C75 42 65 42 60 32 C55 42 45 42 40 32 C35 42 25 42 20 32 C15 42 5 42 0 32 Z" fill="{{primary}}"/>
  <rect x="0" y="0" width="120" height="5" fill="{{accent}}"/>
  <text x="60" y="24" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="{{labelFontSize}}" fill="#FFFFFF">{{label}}</text>
  <path data-name="cutline" d="M0 0 L120 0 L120 32 C115 42 105 42 100 32 C95 42 85 42 80 32 C75 42 65 42 60 32 C55 42 45 42 40 32 C35 42 25 42 20 32 C15 42 5 42 0 32 Z" fill="none" stroke="none"/>
</svg>`,
  },
  {
    id: "shr_starter_flat",
    origin: "starter" as const,
    authoredByStoreId: null,
    name: "Flat banner",
    slug: "flat",
    functionType: "banner",
    aspectRatio: 3,
    defaultSizeMm: 60,
    takesLabel: true,
    status: "live" as const,
    svgTemplate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120mm" height="40mm">
  <rect x="0" y="0" width="120" height="40" fill="{{primary}}"/>
  <rect x="0" y="0" width="120" height="5" fill="{{accent}}"/>
  <text x="60" y="25" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="{{labelFontSize}}" fill="#FFFFFF">{{label}}</text>
  <path data-name="cutline" d="M0 0 L120 0 L120 40 L0 40 Z" fill="none" stroke="none"/>
</svg>`,
  },
] as const;