# SPEC: identity

> **Module ID:** `identity`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`identity`)

---

## 1. Objective

Provide secure, multi-tenant authentication and authorization across the RouteRide platform. Support email/password, phone OTP authentication, Google OAuth 2.0, dual-token JWT rotation (15m access token, 30d refresh token), role-based access control (`ROLE: CONSUMER`, `ROLE: DRIVER`, `ROLE: ADMIN`), and session revocation.

### User Personas
- **Consumer (Parent):** Registers and logs in via Phone OTP, Email/Password, or Google SSO to manage children's commutes.
- **Driver:** Registers via Phone OTP or Email/Password, requires onboarding verification before receiving driver capabilities.
- **Admin:** Authenticates via secure email/password + mandatory 2FA to access the administrative dashboard.

---

## 2. Commands

```bash
# Unit & integration tests for identity
pnpm --filter api test -- src/modules/identity
pnpm --filter api test:integration -- test/auth.integration.test.ts

# Run dev API with auth module
pnpm --filter api dev
```

---

## 3. Project Structure

```
apps/api/src/modules/identity/
├── auth.controller.ts          # Public & protected auth endpoints
├── auth.service.ts             # Auth business logic (registration, login, OTP)
├── jwt.strategy.ts             # Passport JWT extraction and validation
├── refresh-token.service.ts    # SHA-256 hashed refresh token storage & rotation
├── otp.service.ts              # Redis-backed OTP generation & rate limiting
├── roles.guard.ts              # Role-based access control guard
├── current-user.decorator.ts   # Request user context injection
└── dto/                        # Auth DTOs (backed by @routeride/contracts)
```

---

## 4. Code Style & Rules

- **Hashing:** Passwords hashed with bcrypt (work factor >= 12) or argon2id. Refresh tokens stored as SHA-256 hashes only.
- **Tokens:** Access token TTL 900s (15m), Refresh token TTL 2592000s (30d). Refresh token rotation invalidates old tokens upon exchange.
- **Guards:** Every endpoint protected with `JwtAuthGuard` unless explicitly annotated with `@Public()`. Role checks enforced via `@Roles('CONSUMER' | 'DRIVER' | 'ADMIN')`.
- **Ownership:** Service layer strictly asserts `resource.ownerId === request.user.id` or `request.user.role === 'ADMIN'`.

---

## 5. Testing Strategy

- **Unit Tests:** Password hashing, token generation, role guard evaluations, OTP verification logic.
- **Integration Tests:**
  - Login flow (register -> login -> token exchange -> token refresh -> logout).
  - Rate limiting enforcement (5 attempts / 10m on auth, 3 attempts / 5m on OTP).
  - Token replay detection (using an old refresh token invalidates the entire token family).
- **Abuse Cases:** STRIDE AC-1.1 (Brute-force login) and AC-1.2 (Token tampering) tested.

---

## 6. Boundaries & Non-Goals

### In Scope
- Registration, login, token refresh, logout, password reset flow.
- Phone number verification via Twilio Verify / SMS OTP mock.
- Google OAuth 2.0 token verification.
- Role management & permission checks.

### Non-Goals (Out of Scope)
- Biometric authentication (handled on client mobile secure enclave).
- Multi-factor authentication for standard consumers (only admin in Phase 1).

---

## 7. Success Criteria

1. Authenticating with valid credentials issues JWT access + refresh tokens with exact required claims (`sub`, `role`, `email`, `iat`, `exp`).
2. Refreshing an access token rotates the refresh token and invalidates the previous token.
3. Exceeding 5 login failures within 10 minutes returns `429 Too Many Requests` with `Retry-After` header.
4. Non-admin users cannot access routes decorated with `@Roles('ADMIN')`.
5. Passwords or plaintext refresh tokens are never logged or returned in API responses.

---

## 8. Open Questions & Known Gaps

- *Resolved in plan.md §10.6:* `refresh_tokens` table added in migration v2 storing SHA-256 hashes.
