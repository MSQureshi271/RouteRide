# ADR-001: Mobile App Topology — Two Expo Bundles from One Monorepo

## Status

Accepted

## Date

2026-08-23

## Context

RouteRide MVP targets two distinct user roles on mobile:

- **Consumer (parent/commuter)** — discovers drivers, subscribes, tracks live rides, receives notifications.
- **Driver** — receives a daily run list, marks pickups and dropoffs, streams live location continuously, manages their route and availability.

The two roles share almost no screens. The driver shell contains a persistent location-emission loop backed by an Android foreground service; the consumer shell does not require location access at all in MVP.

The core product question is whether to ship one mobile binary (with runtime role switching after login) or two separate binaries (one per role) from the same source repository.

A single Expo monorepo already exists for the web services (`apps/api`, `apps/matching`). The question is how the mobile surface maps onto it.

---

## Decision

**Ship two separate Expo SDK 53 application bundles from the same monorepo:**

| Bundle | Path | Play Store listing | App Store listing |
|--------|------|--------------------|-------------------|
| Consumer app | `apps/mobile-consumer` | RouteRide — Ride Subscriptions | RouteRide — Ride Subscriptions |
| Driver app | `apps/mobile-driver` | RouteRide Driver | RouteRide Driver |

Both bundles share:
- `packages/ui` — design tokens, component library, navigation utilities, and the API network layer
- `packages/contracts` — Zod schemas and TypeScript types generated from the same source of truth
- `packages/config` — environment validation, logging, and OTel tracing setup

No production code lives in the monorepo root. The workspace root contains only build tooling (`turbo.json`, `pnpm-workspace.yaml`) and toolchain config.

---

## Deciding Factor

**The driver app requires the `ACCESS_BACKGROUND_LOCATION` permission and an Android foreground service (`FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION`). The consumer app requires neither.**

Shipping the driver permission set to consumer parents is not a feature trade-off — it is a platform policy liability:

- **Google Play** treats `ACCESS_BACKGROUND_LOCATION` as a sensitive permission requiring a Policy Declaration form and documentary evidence of business necessity. A dual-role app where parents are the majority of installs will be evaluated as a consumer app asking for permanent background location, which is a rejection risk at submission time and an enforcement risk post-launch.
- **Apple App Store** maps `NSLocationAlwaysAndWhenInUseUsageDescription` to App Store Review Guideline 5.1.5 ("apps must request location only when doing so materially improves the user experience"). A parent who has never driven a route provides no plausible justification.
- **Privacy nutrition labels** (both stores) would require listing background location collection for a role that never uses it, which is a misleading label under both store policies.
- **Battery and UX**: an always-on foreground service notification in the consumer parent's notification drawer — for a permission they never consented to use — causes star-rating damage that is disproportionate to any convenience gained.

Separating the permission sets into two binaries eliminates all four concerns. The consumer binary never declares background location. The driver binary's usage is unambiguous.

---

## Alternative Considered

### Single binary with runtime role switching

The user authenticates once and the app renders the consumer or driver shell based on the JWT `role` claim. Both shells compile into the same bundle.

**Pros:**
- One App Store listing and one Play Store listing to manage.
- One OTA update channel.
- One Detox target to configure.
- Simpler initial CI pipeline.

**Cons and rejection rationale:**

1. **Permission set problem (deciding factor, see above):** The single binary must declare the driver's `ACCESS_BACKGROUND_LOCATION` and foreground-service permissions at install time, before the user selects a role. Every consumer parent installs an app that carries driver permissions. This is unjustifiable to both stores and to the privacy nutrition label, and is the direct reason this alternative is rejected.

2. **Role shells share near-zero screens.** The consumer flow is: search → subscribe → live map → notification centre. The driver flow is: run list → start/end trip → pickup/dropoff markers → location stream. The only structural overlap is auth screens, design tokens, and the API client — all of which are extracted into `packages/ui` and `packages/contracts` and shared across both bundles at zero cost.

3. **Review queue coupling.** A change to the driver onboarding wizard or the foreground-service logic triggers a re-review of the consumer binary. With a child-safety-sensitive product, review latency is a first-order concern.

4. **Abuse surface.** A consumer-role JWT could potentially invoke driver-only screens if the role check is not airtight everywhere in the navigation graph. Two binaries provide structural isolation: consumer users literally do not have driver screens compiled into their binary.

**Rejected** because the permission-set problem is unresolvable without splitting the binaries. Returning to this alternative is only sensible if a future product decision eliminates the driver background-location requirement, which is incompatible with the core tracking product.

---

## Consequences

### Permission scope

- `apps/mobile-consumer` declares: camera (profile photo upload), push notifications, network. No location permission of any kind in MVP.
- `apps/mobile-driver` declares: camera, push notifications, network, fine location (`ACCESS_FINE_LOCATION`, `NSLocationWhenInUseUsageDescription`), background location (`ACCESS_BACKGROUND_LOCATION`, `NSLocationAlwaysAndWhenInUseUsageDescription`), and the Android foreground service (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`).
- Permission divergence is enforced at the `app.json` / `app.config.ts` level per bundle. `packages/ui` never imports any permission-gated native module; those imports live in `apps/mobile-driver` only.

### Store listing

- Two Play Store listings and two App Store listings to maintain: metadata, screenshots, privacy policies, and review forms are independent.
- The driver listing must submit the Play Store background-location declaration form with documented driver-role justification before it can go live.
- The consumer listing undergoes standard review. Any consumer-facing change (e.g. a subscription screen update) does not trigger re-review of the driver binary.
- Both listings reference the same privacy policy URL, which must cover both role profiles. The privacy nutrition labels are different: the driver listing includes background location; the consumer listing does not.
- Certificate and signing key management: two provisioning profiles on Apple, two Play Store signing configurations. Managed via EAS Credentials (Expo Application Services).

### OTA updates

- Each bundle has its own EAS Update channel: `consumer-production`, `consumer-staging`, `driver-production`, `driver-staging`.
- A hotfix to a consumer-only screen (e.g. a payment UI bug) ships as an OTA update to `consumer-production` without touching the driver binary. No driver re-download required, and no driver app store review triggered.
- Changes to `packages/ui` or `packages/contracts` affect both bundles and require coordinated OTA pushes to both channels when the change is backward-compatible, or a store binary update when native modules or permissions change.
- Breaking API contract changes (e.g. a Zod schema change in `packages/contracts`) must be coordinated across the API deploy and both OTA channels. The convention is: deploy the API with backward-compatible support for the old shape, push OTA to both channels, then drop the old shape from the API in a subsequent deploy.
- EAS Update runtime version is pinned per bundle to its Expo SDK version. SDK upgrades require a store binary update, not an OTA update — this is an Apple and Google policy constraint, not an architectural one.

### Bundle size

- Each user downloads only their role's binary. A consumer parent never downloads the driver foreground-service native module, the background-location bridge code, or the trip-management screens.
- At build time, Metro bundler tree-shakes each entry point separately. Shared code in `packages/ui` and `packages/contracts` is included only once in each bundle.
- Typical Expo SDK 53 baseline: ~15–20 MB download per binary. Driver binary is expected to be ~2–4 MB larger than the consumer binary due to the foreground-service native module. Both are within normal store expectations for a navigation/transport app.
- There is no "double download" cost: a user is either a consumer or a driver and installs exactly one binary.

### CI pipeline

- Two Detox targets exist in the nightly E2E job: `ios.consumer.sim.debug`, `ios.driver.sim.debug`, and Android equivalents.
- Unit and integration tests in `apps/mobile-consumer` and `apps/mobile-driver` run as separate jobs with path filters: a change that touches only `apps/mobile-consumer/**` skips the driver job and vice versa. Changes to `packages/ui` or `packages/contracts` trigger both.
- EAS Build runs are separate per bundle. Staging and production builds are independent jobs in the CD pipeline.

### Future extensibility (Phase 2+)

- Additional roles (Institution Admin, Fleet Operator) can be introduced as new bundles (`apps/mobile-institution`, `apps/mobile-fleet`) without any restructuring. They inherit `packages/ui` and `packages/contracts` at the same cost as the existing two.
- If a future product decision determines that the consumer app should have an optional driver mode (e.g. to support multi-role users), the architecture does not prevent this — it would require a deliberate decision to merge or link the binaries, and a new ADR superseding this one.
- The monorepo structure (`pnpm workspaces` + Turborepo) scales to additional bundles without a tooling change.

---

## References

- `tasks/plan.md` §2, T-01 — Original assumption recorded as decided 2026-08-23
- `tasks/plan.md` §4, ADR-001 — Architecture decision table entry
- `tasks/todo.md` T-D.01 — Task definition and acceptance criteria
- `tasks/plan.md` §11 — Risk: "Two mobile bundles double the release surface (B5)" and its mitigation
- Google Play Policy — [Background Location Permission](https://support.google.com/googleplay/android-developer/answer/9799150)
- Apple App Store Review Guidelines — [Guideline 5.1.5, Location Services](https://developer.apple.com/app-store/review/guidelines/#privacy)
- TRD §2.1 — Mobile client runtime: Expo SDK 53, React Native 0.76
- TRD §6.4 — Driver location emission and the Android foreground service requirement
- `ADR-005` — pnpm workspaces monorepo with shared `packages/contracts` (companion decision)
