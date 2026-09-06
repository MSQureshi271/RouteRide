/**
 * Token contrast ratio tests.
 *
 * Asserts every foreground/background token pair used in the RouteRide design
 * system meets WCAG 2.1 AA minimums:
 *  - Normal text:  ≥ 4.5:1
 *  - Large text:   ≥ 3.0:1 (18px+ regular or 14px+ bold)
 *
 * Algorithm: relative luminance per WCAG 2.1 §1.4.3
 * https://www.w3.org/TR/WCAG21/#contrast-minimum
 */

import { colors } from "./tokens";

// ─── WCAG helpers ─────────────────────────────────────────────────────────────

/** Convert an 8-bit channel value [0–255] to linear light */
function toLinear(channel: number): number {
  const sRGB = channel / 255;
  return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a hex color string, e.g. "#0B1C30" */
function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two colors */
function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Pairs to assert ──────────────────────────────────────────────────────────

/**
 * Every foreground/background combination used in RouteRide components.
 * min: the WCAG AA minimum ratio required for that usage.
 * 4.5 = normal text, 3.0 = large text or UI components.
 */
const pairs: Array<{ fg: string; bg: string; label: string; min: number }> = [
  // Primary (Trust Navy)
  {
    fg: colors.onPrimary,
    bg: colors.primary,
    label: "onPrimary / primary",
    min: 4.5,
  },
  {
    fg: colors.onPrimaryContainer,
    bg: colors.primaryContainer,
    label: "onPrimaryContainer / primaryContainer",
    min: 4.5,
  },
  // Secondary (Safety Emerald)
  {
    fg: colors.onSecondary,
    bg: colors.secondary,
    label: "onSecondary / secondary",
    min: 4.5,
  },
  {
    fg: colors.onSecondaryContainer,
    bg: colors.secondaryContainer,
    label: "onSecondaryContainer / secondaryContainer",
    min: 4.5,
  },
  // Tertiary (Route Blue)
  {
    fg: colors.onTertiaryContainer,
    bg: colors.tertiaryContainer,
    label: "onTertiaryContainer / tertiaryContainer",
    min: 4.5,
  },
  // Surfaces
  {
    fg: colors.onSurface,
    bg: colors.surface,
    label: "onSurface / surface",
    min: 4.5,
  },
  {
    fg: colors.onSurface,
    bg: colors.surfaceContainerLowest,
    label: "onSurface / surfaceContainerLowest",
    min: 4.5,
  },
  {
    fg: colors.onSurface,
    bg: colors.surfaceContainerLow,
    label: "onSurface / surfaceContainerLow",
    min: 4.5,
  },
  {
    fg: colors.onSurfaceVariant,
    bg: colors.surface,
    label: "onSurfaceVariant / surface",
    min: 4.5,
  },
  // Background
  {
    fg: colors.onBackground,
    bg: colors.background,
    label: "onBackground / background",
    min: 4.5,
  },
  // Error
  { fg: colors.onError, bg: colors.error, label: "onError / error", min: 4.5 },
  {
    fg: colors.onErrorContainer,
    bg: colors.errorContainer,
    label: "onErrorContainer / errorContainer",
    min: 4.5,
  },
  // Status chips (UI badge components → 3.0:1 AA minimum for graphical UI elements)
  {
    fg: "#FFFFFF",
    bg: colors.statusPickedUp,
    label: "white / statusPickedUp",
    min: 3.0,
  },
  {
    fg: "#FFFFFF",
    bg: colors.statusEnRoute,
    label: "white / statusEnRoute",
    min: 3.0,
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Design token contrast ratios (WCAG 2.1 AA)", () => {
  test.each(pairs)(
    "$label meets minimum contrast ratio of $min:1",
    ({ fg, bg, min }) => {
      const ratio = contrast(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(min);
    },
  );
});
