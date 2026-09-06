---
name: RouteLink
colors:
  surface: "#f8f9ff"
  surface-dim: "#cbdbf5"
  surface-bright: "#f8f9ff"
  surface-container-lowest: "#ffffff"
  surface-container-low: "#eff4ff"
  surface-container: "#e5eeff"
  surface-container-high: "#dce9ff"
  surface-container-highest: "#d3e4fe"
  on-surface: "#0b1c30"
  on-surface-variant: "#45464d"
  inverse-surface: "#213145"
  inverse-on-surface: "#eaf1ff"
  outline: "#76777d"
  outline-variant: "#c6c6cd"
  surface-tint: "#565e74"
  primary: "#000000"
  on-primary: "#ffffff"
  primary-container: "#131b2e"
  on-primary-container: "#7c839b"
  inverse-primary: "#bec6e0"
  secondary: "#006c49"
  on-secondary: "#ffffff"
  secondary-container: "#6cf8bb"
  on-secondary-container: "#00714d"
  tertiary: "#000000"
  on-tertiary: "#ffffff"
  tertiary-container: "#001a42"
  on-tertiary-container: "#3980f4"
  error: "#ba1a1a"
  on-error: "#ffffff"
  error-container: "#ffdad6"
  on-error-container: "#93000a"
  primary-fixed: "#dae2fd"
  primary-fixed-dim: "#bec6e0"
  on-primary-fixed: "#131b2e"
  on-primary-fixed-variant: "#3f465c"
  secondary-fixed: "#6ffbbe"
  secondary-fixed-dim: "#4edea3"
  on-secondary-fixed: "#002113"
  on-secondary-fixed-variant: "#005236"
  tertiary-fixed: "#d8e2ff"
  tertiary-fixed-dim: "#adc6ff"
  on-tertiary-fixed: "#001a42"
  on-tertiary-fixed-variant: "#004395"
  background: "#f8f9ff"
  on-background: "#0b1c30"
  surface-variant: "#d3e4fe"
  safety-emerald: "#10B981"
  trust-navy: "#0F172A"
  route-blue: "#3B82F6"
  status-picked-up: "#059669"
  status-en-route: "#D97706"
  surface-muted: "#F8FAFC"
typography:
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: "700"
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: "700"
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: "600"
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "600"
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: "500"
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  container-max-width: 1200px
---

## Brand & Style

The design system is anchored in **Professionalism, Trust, and Operational Clarity**. Given the high-stakes nature of recurring transportation for students and commuters, the visual language moves away from the "disposable" feel of gig-economy apps toward a more **Institutional yet Modern** aesthetic.

The chosen style is **Corporate Modern with Tactile Clarity**. It utilizes a structured grid, clear layering, and high-contrast status indicators to ensure "at-a-glance" reliability. The UI should feel substantial and secure, using subtle depth to separate critical navigation data from background map elements.

- **Trust:** Established through a stable, grounded color palette and symmetrical layouts.
- **Safety:** Conveyed via "Safety-First" accent colors and prominent status indicators.
- **Efficiency:** Achieved through compact data density in driver views and clear vertical rhythms for scheduling.

## Colors

The palette is designed to evoke a sense of calm and institutional reliability.

- **Primary (Trust Navy):** Used for core branding, typography, and primary navigation to provide a grounded, authoritative feel.
- **Secondary (Safety Emerald):** Reserved for "Success" states, safety confirmations (e.g., "Picked Up"), and the "Service Provider" role mode.
- **Tertiary (Route Blue):** Used for "Active" states, GPS paths, and the "Consumer" role mode.
- **Neutral:** A sophisticated range of cool grays used for borders, secondary text, and background layering.

**Role Differentiation:**
The design system uses color as a functional signal. When in "Driver Mode," the interface uses Safety Emerald as the primary action color. In "Consumer Mode," Route Blue takes the lead. This ensures the user always knows their current operational context.

## Typography

Typography is optimized for legibility during movement.

- **Headlines (Manrope):** A modern, balanced geometric sans-serif that feels professional and approachable. Used for screen titles and driver names.
- **Body (Inter):** A highly legible, systematic font designed for screen interfaces. It handles high-density passenger lists and route details with ease.
- **Data (JetBrains Mono):** Used specifically for ETAs, timestamps, and "Vertical Timeline" data. The monospaced nature ensures that numbers align perfectly in lists, allowing for faster scanning of schedules.

**Hierarchy Rules:**

- Use `label-caps` for all-caps status labels (e.g., EN ROUTE).
- Use `data-mono` for any dynamic time-based information to prevent layout shifts when numbers change.

## Layout & Spacing

The system follows a **4px baseline grid** to maintain strict vertical rhythm, particularly important for the "Driver Manifest" and "Vertical Timelines."

- **Fluid Mobile Grid:** A 4-column fluid system with 16px margins for hand-held operational use.
- **Fixed Desktop Grid:** A 12-column grid for the administrative "Route Definition" and "Consumer Discovery" views.
- **Vertical Timelines:** Elements in the timeline use consistent 32px spacing between waypoints to ensure touch targets for "Check-in" are accessible.

**Layout Philosophy:**
The app uses "Map-Centric Layering." The base layer is always the map or the primary data list. Interactive elements (Attendance logging, ETA adjustments) should appear in "Bottom Sheets" or "Floating Panels" to keep the user's geographical context visible at all times.

## Elevation & Depth

Visual hierarchy is managed through **Tonal Layering** and **Ambient Shadows**.

- **Level 0 (Base):** The map or main background (Surface Muted).
- **Level 1 (Cards):** White surfaces with a soft, 4% opacity shadow and a 1px border (#E2E8F0). Used for Discovery cards and Schedule items.
- **Level 2 (Floating):** Drawers and Bottom Sheets. These use a more pronounced shadow (12% opacity) to indicate they are temporary, actionable layers above the map.
- **Status Indicators:** These use high-contrast color fills rather than elevation to signify importance, ensuring they remain visible even in high-glare environments (e.g., a driver's dashboard).

## Shapes

The shape language is **Rounded**, striking a balance between friendly approachability and professional structure.

- **Buttons & Cards:** 0.5rem (8px) corner radius provides a modern, soft feel without appearing "toy-like."
- **Status Tags:** Use a fully pill-shaped (rounded-full) geometry to differentiate them from interactive card elements.
- **Map Markers:** Custom pin shapes with a 4px inner radius to maintain the "RouteLink" aesthetic across the map interface.

## Components

### Buttons

- **Primary:** Solid Trust Navy (Consumer) or Safety Emerald (Driver). High-affordance, 48px minimum height for mobile ease.
- **Secondary:** Outlined with 1px border. Used for "Cancel" or "Edit Route" actions.

### Cards

- **Discovery Card:** Displays Driver Profile, Car Details, and "Route Overlap %." The overlap percentage should be a circular progress indicator in the top-right corner.
- **Timeline Card:** A compact card used in the Driver Manifest. Left-aligned `data-mono` timestamp, center-aligned Passenger Name, and right-aligned "Check-in" toggle.

### Attendance & Status

- **Status Chips:** High-contrast backgrounds with white `label-caps` text. Colors must strictly follow the semantic mapping (Emerald for Picked Up, Amber for En Route).
- **Check-in Toggle:** A large, tactile switch or "Slide to Confirm" component to prevent accidental attendance logging.

### Input Fields

- **Search:** Located at the top of the Discovery Feed with a 1px border and a subtle inner shadow.
- **Route Inputs:** Multi-step inputs for defining "Home" and "Destination" with clear "A to B" visual connectors.

### Navigation Indicators

- **Vertical Timeline:** A solid 2px line connecting waypoints. The line changes from Neutral Gray to Route Blue as the vehicle progresses along the sequence.
