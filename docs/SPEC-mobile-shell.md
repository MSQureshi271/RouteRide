# SPEC: mobile-shell

> **Module ID:** `mobile-shell`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`mobile-shell`)

---

## 1. Objective

Provide the cross-platform Expo SDK 53 mobile shells for both Consumer (Parent) and Driver applications. Establish common design tokens, shared UI component library (`@routeride/ui`), React Navigation routing hierarchies, secure token storage (`expo-secure-store`), offline state synchronization (TanStack Query), and native device permissions (background location, push notifications).

### User Personas
- **Consumer User:** Parent navigating ride discovery, subscriptions, live tracking maps, chat, and invoices.
- **Driver User:** Driver managing route profiles, onboarding uploads, daily trip rosters, passenger pickup/drop-off execution, and background location broadcasting.

---

## 2. Commands

```bash
# Start Consumer App
pnpm --filter mobile-consumer start
pnpm --filter mobile-consumer android
pnpm --filter mobile-consumer ios

# Start Driver App
pnpm --filter mobile-driver start
pnpm --filter mobile-driver android
pnpm --filter mobile-driver ios

# Test UI Components & Screens
pnpm --filter ui test
pnpm --filter mobile-consumer test
pnpm --filter mobile-driver test
```

---

## 3. Project Structure

```
apps/
├── mobile-consumer/            # Consumer Mobile App (Expo SDK 53)
│   ├── app/                    # Expo Router file-based navigation
│   │   ├── (auth)/             # Login, Register, OTP screens
│   │   ├── (tabs)/             # Home, Subscriptions, Activity, Profile
│   │   └── trips/[id].tsx      # Live Trip Tracking Map
│   └── src/
│       ├── api/                # TanStack query clients backed by contracts
│       └── store/              # SecureStore auth token bridge
├── mobile-driver/              # Driver Mobile App (Expo SDK 53)
│   ├── app/
│   │   ├── (auth)/             # Driver login & onboarding wizard
│   │   ├── (tabs)/             # Schedule, Active Run, Earnings, Profile
│   │   └── run/[id].tsx        # Turn-by-turn stop manifest & passenger checklist
│   └── src/
│       └── background/         # Expo TaskManager foreground service & location task
└── packages/ui/                # Shared Component Library
    ├── src/
    │   ├── theme/              # Color palette, spacing, typography tokens
    │   ├── atoms/              # Button, Input, Card, Badge, Typography
    │   └── molecules/          # StatusBanner, RiderCard, StopListItem
```

---

## 4. Code Style & Rules

- **Design System:** All components use tokens from `@routeride/ui`. No ad-hoc inline hex color literals or arbitrary magic dimensions.
- **State States:** Every screen must implement 4 explicit visual states: Loading skeleton, Empty state with CTA, Error boundary with retry, Populated content.
- **Security:** Sensitive tokens (access & refresh) stored strictly in `expo-secure-store`, never in `AsyncStorage`.
- **Accessibility:** Meet WCAG 2.1 AA (min 44x44pt touch targets, color contrast >= 4.5:1, screen reader accessibilityLabels).

---

## 5. Testing Strategy

- **Component Tests:** Jest + React Native Testing Library testing atom rendering, disabled states, and button trigger callbacks.
- **Hook Tests:** TanStack Query hook mocking verifying auth refresh headers and cache invalidation.
- **E2E Smoke (Phase 1):** Detox / Maestro flow verifying Login -> Home -> Details screen transitions.

---

## 6. Boundaries & Non-Goals

### In Scope
- Separate app topologies for Consumer and Driver (per ADR-001).
- Unified shared token & component package (`@routeride/ui`).
- Background location service scaffold for Driver app (`expo-location` + `expo-task-manager`).
- Push notification token registration handler (`expo-notifications`).

### Non-Goals (Out of Scope)
- Web responsive admin portal (implemented in Next.js under `apps/admin`).
- Offline trip creation (trips require server-side conflict locks).

---

## 7. Success Criteria

1. Both apps build and launch on Android/iOS simulators via Expo SDK 53 with zero bundle errors.
2. Tokens persist across app cold starts via SecureStore and refresh automatically when expired.
3. Every UI component conforms to the design token scale with WCAG 2.1 AA accessibility labels.
4. Driver app requests and obtains Foreground Service and Background Location permissions.

---

## 8. Open Questions & Known Gaps

- *Resolved in ADR-001:* Dual-bundle Expo monorepo chosen over single universal app to prevent driver permission bloat on consumer devices.
