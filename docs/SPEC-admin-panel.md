# SPEC: admin-panel

> **Module ID:** `admin-panel`  
> **Status:** Draft / Phase 0  
> **Capability Map Reference:** `tasks/plan.md` §3 (`admin-panel`)

---

## 1. Objective

Provide a secure Next.js 15 administrative portal for platform operations staff. Support the driver verification queue (inspecting CNIC, Driving License, Vehicle Registration documents from S3), driver approval and rejection workflows, account suspension/unsuspension, live platform operations map, system configuration management (`platform_config` commission rates & pricing bounds), payment refund processing, and immutable admin audit logging.

### User Personas
- **Platform Admin / Operations Agent:** Reviews pending driver onboarding submissions, monitors live trips across Karachi, adjusts platform configuration parameters, and manages support disputes.

---

## 2. Commands

```bash
# Start Admin Panel dev server
pnpm --filter admin dev

# Build & lint Admin Panel
pnpm --filter admin lint
pnpm --filter admin build
pnpm --filter admin test
```

---

## 3. Project Structure

```
apps/admin/
├── app/                        # Next.js 15 App Router
│   ├── (auth)/login/           # Admin 2FA login
│   ├── (dashboard)/
│   │   ├── drivers/            # Driver onboarding verification queue & details
│   │   ├── trips/              # Live active trips map & status overview
│   │   ├── config/             # Platform commission & parameter editor
│   │   └── audit/              # Immutable admin action audit logs
├── components/                 # Admin UI components (Tables, Modals, Map views)
└── lib/                        # API client backed by @routeride/contracts
```

---

## 4. Code Style & Rules

- **RBAC Enforcement:** All admin API endpoints and web routes require `ROLE: ADMIN` authentication with valid session cookie or bearer token.
- **Audit Trail:** EVERY administrative state modification (driver approval, suspension, refund, config change) MUST insert an immutable record into `admin_audit_logs` containing `admin_user_id`, `action`, `target_id`, `reason`, `ip_address`, and `timestamp`.
- **Document Viewing:** S3 document URLs are fetched via short-lived (5-minute) presigned GET URLs and never cached publicly.

---

## 5. Testing Strategy

- **Component Tests:** Verification action modal, document viewer carousel, audit log table rendering.
- **Integration Tests:**
  - Admin logs in -> inspects pending driver -> approves driver -> driver status becomes `APPROVED` and audit log is recorded.
  - Non-admin user attempting to hit `/api/v1/admin/*` receives `403 Forbidden`.
  - Config update modifies `platform_config` and updates cache.

---

## 6. Boundaries & Non-Goals

### In Scope
- Driver document review workflow (Approve / Reject with rejection reason).
- Driver account suspension.
- Dynamic platform commission rate adjustment.
- Immutable admin audit logging.

### Non-Goals (Out of Scope)
- Automated algorithmic document OCR in MVP (manual inspection per Q7).
- Public access or parent access to the admin dashboard.

---

## 7. Success Criteria

1. Admin can log in, view pending driver document uploads, and click Approve or Reject.
2. Approving a driver immediately activates their route for matching search.
3. Every admin action generates a corresponding record in `admin_audit_logs`.
4. Unauthorized access attempts to the admin dashboard are rejected and logged.

---

## 8. Open Questions & Known Gaps

- *Resolved in regulatory review:* Manual document inspection confirmed as required compliance mechanism.
