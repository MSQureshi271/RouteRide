# ADR-005: Monorepo Architecture with Shared Contracts Package

## Status

Accepted

## Date

2026-08-25

## Context

RouteRide comprises multiple interacting systems:

- A backend API server (`apps/api` in NestJS/Fastify)
- A specialized route-matching microservice (`apps/matching` in Python FastAPI)
- A Next.js web admin portal (`apps/admin`)
- Two distinct React Native / Expo mobile client bundles (`apps/mobile-consumer` and `apps/mobile-driver`)

Developing these systems across disjoint repositories creates substantial friction:

- Schema and DTO synchronization drift between frontend and backend.
- Duplicated validation logic between client forms and server endpoints.
- Broken contracts discovered only at integration test time or in production.
- Inability to build frontend features against typed mocks while backend endpoints are in flight.

## Decision

1. Organize the entire codebase into a single monorepo using **pnpm workspaces** and **Turborepo** for build pipeline orchestration.
2. Establish a contract-first architecture anchored by **`packages/contracts`**, which defines:
   - Zod schemas for every request DTO, response envelope, query parameter, and WebSocket event payload.
   - Strict TypeScript types inferred directly from Zod schemas (`z.infer<typeof ...>`).
   - Automated OpenAPI 3.1 schema generation (`packages/contracts/openapi.json`).
3. Enforce contract-first development: mobile apps and admin frontend develop against the contracts package, eliminating runtime shape surprises.

## Alternatives Considered

### 1. Multi-Repo Architecture with Published NPM Packages

- _Pros_: Isolated CI pipelines, independent versioning per repository.
- _Cons_: High overhead for cross-cutting changes; version drift between packages; slow iteration speed during MVP foundation.
- _Rejected_: Coordination overhead exceeds benefits for a unified engineering team.

### 2. Backend-Driven Type Generation (e.g. tRPC or NestJS Swagger auto-gen)

- _Pros_: Fast backend-only setup.
- _Cons_: Coupes types strictly to the NestJS runtime; does not naturally share types with the Python matching service or standalone mobile clients without complex extraction pipelines.
- _Rejected_: Contract-first Zod schemas serve as the single source of truth for TypeScript, Python (via JSON schema / Pydantic), and OpenAPI documentation.

## Consequences

- **Positive**: Strict compile-time type safety across API, web admin, and mobile clients.
- **Positive**: OpenAPI 3.1 specification is always guaranteed to match runtime validation schemas.
- **Positive**: Frontends can mock API responses with 100% type fidelity before backend endpoints are built.
- **Negative**: Requires monorepo tooling discipline (pnpm workspace protocols, Turborepo caching).
