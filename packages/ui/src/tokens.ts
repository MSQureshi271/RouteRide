/**
 * RouteRide Design Tokens
 *
 * Single source of truth for all visual constants.
 * All values are derived directly from DESIGN.md.
 *
 * Rules:
 *  - No raw hex values outside this file in any component.
 *  - No spacing values outside this file's scale.
 *  - No font families or sizes outside this file's type scale.
 *
 * Role differentiation:
 *  - Consumer mode → primary (#000000 Trust Navy) for primary actions
 *  - Driver mode   → secondary (#006c49 Safety Emerald) for primary actions
 */

// ─── Color Palette ────────────────────────────────────────────────────────────

export const colors = {
  // Surface system
  surface: "#F8F9FF",
  surfaceDim: "#CBDBF5",
  surfaceBright: "#F8F9FF",
  surfaceContainerLowest: "#FFFFFF",
  surfaceContainerLow: "#EFF4FF",
  surfaceContainer: "#E5EEFF",
  surfaceContainerHigh: "#DCE9FF",
  surfaceContainerHighest: "#D3E4FE",
  surfaceMuted: "#F8FAFC",
  surfaceVariant: "#D3E4FE",

  // On-surface
  onSurface: "#0B1C30",
  onSurfaceVariant: "#45464D",
  inverseSurface: "#213145",
  inverseOnSurface: "#EAF1FF",

  // Outline
  outline: "#76777D",
  outlineVariant: "#C6C6CD",
  surfaceTint: "#565E74",

  // Primary (Trust Navy) — Consumer primary actions
  primary: "#000000",
  onPrimary: "#FFFFFF",
  primaryContainer: "#131B2E",
  onPrimaryContainer: "#7C839B",
  inversePrimary: "#BEC6E0",
  primaryFixed: "#DAE2FD",
  primaryFixedDim: "#BEC6E0",
  onPrimaryFixed: "#131B2E",
  onPrimaryFixedVariant: "#3F465C",

  // Secondary (Safety Emerald) — Driver primary actions, success states
  secondary: "#006C49",
  onSecondary: "#FFFFFF",
  secondaryContainer: "#6CF8BB",
  onSecondaryContainer: "#00714D",
  secondaryFixed: "#6FFBBE",
  secondaryFixedDim: "#4EDEA3",
  onSecondaryFixed: "#002113",
  onSecondaryFixedVariant: "#005236",

  // Tertiary (Route Blue) — Active GPS/routing states, consumer accents
  tertiary: "#000000",
  onTertiary: "#FFFFFF",
  tertiaryContainer: "#001A42",
  onTertiaryContainer: "#3980F4",
  tertiaryFixed: "#D8E2FF",
  tertiaryFixedDim: "#ADC6FF",
  onTertiaryFixed: "#001A42",
  onTertiaryFixedVariant: "#004395",

  // Semantic extras from DESIGN.md
  safetyEmerald: "#10B981",
  trustNavy: "#0F172A",
  routeBlue: "#3B82F6",
  statusPickedUp: "#059669",
  statusEnRoute: "#D97706",

  // Error
  error: "#BA1A1A",
  onError: "#FFFFFF",
  errorContainer: "#FFDAD6",
  onErrorContainer: "#93000A",

  // Background / On-background
  background: "#F8F9FF",
  onBackground: "#0B1C30",
} as const;

export type ColorToken = keyof typeof colors;

// ─── Spacing (4px baseline grid from DESIGN.md) ───────────────────────────────

export const spacing = {
  /** 4px — micro space, icon padding */
  xs: 4,
  /** 8px — tight gap between inline elements */
  sm: 8,
  /** 12px — comfortable gap in list items */
  md: 12,
  /** 16px — standard gutter / margin-mobile */
  base: 16,
  /** 24px — section spacing */
  lg: 24,
  /** 32px — timeline waypoint spacing, margin-desktop */
  xl: 32,
  /** 48px — major section separation */
  xxl: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

// ─── Border Radius ────────────────────────────────────────────────────────────

export const radii = {
  /** 4px — subtle rounding on small elements */
  sm: 4,
  /** 8px — buttons, cards (DESIGN.md default) */
  md: 8,
  /** 12px */
  lg: 12,
  /** 16px — large cards, modals */
  xl: 16,
  /** 9999px — pill badges, status chips (DESIGN.md rounded-full) */
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radii;

// ─── Typography ───────────────────────────────────────────────────────────────

/**
 * Font family names. Must match the names registered via expo-font in _layout.tsx.
 * Source: DESIGN.md typography section
 */
export const fontFamilies = {
  /** Manrope — headlines, screen titles, driver names */
  headlineBold: "Manrope-Bold",
  headlineSemiBold: "Manrope-SemiBold",
  headlineRegular: "Manrope-Regular",
  /** Inter — body copy, form fields, passenger lists */
  bodySemiBold: "Inter-SemiBold",
  bodyMedium: "Inter-Medium",
  bodyRegular: "Inter-Regular",
  /** JetBrains Mono — ETAs, timestamps, OTP digits */
  mono: "JetBrainsMono-Medium",
} as const;

/**
 * Typography scale — full text style objects ready for StyleSheet.
 * Source: DESIGN.md typography section
 */
export const typography = {
  /** Screen title — Manrope Bold 32/40, -0.02em */
  headlineLg: {
    fontFamily: fontFamilies.headlineBold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.64, // -0.02em at 32px
  },
  /** Mobile screen title — Manrope Bold 24/32, -0.01em */
  headlineLgMobile: {
    fontFamily: fontFamilies.headlineBold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.24, // -0.01em at 24px
  },
  /** Section header — Manrope SemiBold 20/28 */
  headlineMd: {
    fontFamily: fontFamilies.headlineSemiBold,
    fontSize: 20,
    lineHeight: 28,
  },
  /** Standard body — Inter Regular 16/24 */
  bodyLg: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 16,
    lineHeight: 24,
  },
  /** Compact body — Inter Regular 14/20 */
  bodyMd: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 14,
    lineHeight: 20,
  },
  /** Status labels (all-caps) — Inter SemiBold 12/16, 0.05em */
  labelCaps: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6, // 0.05em at 12px
    textTransform: "uppercase" as const,
  },
  /** ETAs, timestamps, OTP digits — JetBrains Mono 13/18 */
  dataMono: {
    fontFamily: fontFamilies.mono,
    fontSize: 13,
    lineHeight: 18,
  },
} as const;

export type TypographyToken = keyof typeof typography;

// ─── Elevation / Shadows ──────────────────────────────────────────────────────

/**
 * Two shadow levels from DESIGN.md's elevation system.
 * React Native shadow properties for iOS; elevation for Android.
 */
export const shadows = {
  /** Level 1 — Cards: soft 4% opacity shadow + 1px border */
  card: {
    shadowColor: colors.onSurface,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  /** Level 2 — Bottom sheets / Drawers: 12% opacity, temporary layer */
  sheet: {
    shadowColor: colors.onSurface,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export type ShadowToken = keyof typeof shadows;

// ─── Touch target minimum ─────────────────────────────────────────────────────

/** WCAG 2.5.5 AA minimum interactive target size */
export const minTouchTarget = 48;

// ─── Breakpoints (for web-compatible rendering) ───────────────────────────────

export const breakpoints = {
  mobile: 320,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;
