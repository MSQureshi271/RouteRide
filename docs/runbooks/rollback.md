# RouteRide — Production Rollback Runbook

> **Target Audience**: On-call engineers and incident responders.  
> **Standing Bar**: This runbook must be executable by any engineer on call with zero tribal knowledge.

---

## 1. Rollback Trigger Thresholds

Per `.agents/skills/shipping-and-launch`, initiate immediate mitigation/rollback if any of the following automated alarms trigger during or following a release:

| Signal                                  | Metric                                           | Threshold                                       | Action Window                 |
| :-------------------------------------- | :----------------------------------------------- | :---------------------------------------------- | :---------------------------- |
| **Error Rate (RED: Errors)**            | `http_requests_total{status=~"5.."}`             | **> 1.0%** of total requests over 3 min         | Immediate Rollback            |
| **Latency Degradation (RED: Duration)** | `http_request_duration_seconds{quantile="0.99"}` | **> 2000 ms** over 3 consecutive minutes        | Immediate Rollback            |
| **Health Probe Failure**                | `GET /health`                                    | **HTTP 503** or unhandled timeout > 5s          | Automatic ECS Rollback (< 5m) |
| **Database Pool Exhaustion**            | `db_operation_duration_seconds{status="error"}`  | Active connections > 90% or pool queue timeouts | Immediate Rollback            |
| **Payment Integrity Failure**           | Webhook verification / Charge exceptions         | Any unhandled 500 on `/payments/webhook`        | Immediate Feature Kill        |

---

## 2. Three-Tier Mitigation Strategy

Depending on the root cause, choose the fastest path to safety:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Feature Flag Kill Switch      (TTR: < 30 seconds)        │
│    Disable malfunctioning feature without redeploying code  │
└──────────────────────────────┬──────────────────────────────┘
                               │ If code/container bug:
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Container Image Rollback       (TTR: < 2 minutes)        │
│    Redeploy previous known-good Docker image SHA via GitHub │
└──────────────────────────────┬──────────────────────────────┘
                               │ If breaking schema migration:
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Database Migration Rollback   (TTR: < 5-10 minutes)      │
│    Revert destructive DDL / restore point-in-time snapshot  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Tier 1: Feature Flag Kill Switch (TTR < 30s)

If the incident is isolated to a new feature (e.g., a new search filter, payment gateway toggle, or notification channel):

1. Navigate to the feature flag management dashboard (Unleash / AWS AppConfig).
2. Locate the offending flag (e.g. `FEATURE_REALTIME_MAP_V2` or `FLAG_PAYMENT_RETRY_V2`).
3. Toggle the status to **OFF** (`false`).
4. Monitor Prometheus `/metrics` to verify error rate drops immediately to baseline.

---

## 4. Tier 2: Container Image Rollback (TTR < 2 min)

When a regression or crash-loop exists in application code:

### Option A: GitHub Actions (Recommended)

1. Go to **GitHub Actions** → **[Emergency Rollback](file:///.github/workflows/rollback.yml)**.
2. Click **Run workflow**.
3. Select parameters:
   - **Environment**: `production` (or `staging`)
   - **Service**: `api` (or `matching`, `admin`)
   - **Target Image Tag**: Enter the previous stable git SHA (e.g. `sha-4f8a29c`) or release tag.
   - **Reason**: Brief incident description (e.g. `INC-104: P99 latency regression`).
4. Click **Run workflow**. The workflow renders the previous task definition, triggers an ECS rolling update, and runs smoke verification.

### Option B: AWS CLI (Direct Failover)

If GitHub Actions is unreachable, run directly via AWS CLI with deployment credentials:

```bash
# 1. Fetch previous stable task definition revision number
PREV_REVISION=$(aws ecs list-task-definitions \
  --family-prefix routeride-prod-api \
  --sort DESC \
  --query "taskDefinitionArns[1]" \
  --output text)

# 2. Update service to previous revision
aws ecs update-service \
  --cluster routeride-prod-cluster \
  --service routeride-prod-api \
  --task-definition "$PREV_REVISION" \
  --force-new-deployment

# 3. Wait for service stability
aws ecs wait services-stable \
  --cluster routeride-prod-cluster \
  --services routeride-prod-api
```

---

## 5. Tier 3: Database Migration Rollback (TTR < 5-10 min)

### Principle: Expand/Contract Database Deployments

RouteRide enforces backward-compatible database schema changes:

- **Phase 1 (Expand)**: Add columns as nullable with default values. Old code continues to work.
- **Phase 2 (Migrate)**: Code is deployed that reads/writes the new column.
- **Phase 3 (Contract)**: Drop old unused columns in a separate release after verifying stability.

Because of this rule, rolling back application code to a previous image almost never requires rolling back database DDL.

### If Emergency DDL Reversion is Required:

1. Identify the failing migration step.
2. Run Prisma migration resolution:
   ```bash
   pnpm --filter @routeride/api prisma orm migrate resolve --rolled-back <MIGRATION_NAME>
   ```
3. If data corruption occurred, initiate RDS Point-in-Time Recovery (PITR) to a timestamp 5 minutes prior to the deployment.

---

## 6. Post-Rollback Verification Checklist

Following rollback execution:

- [ ] `GET /health` returns HTTP 200 with `{ status: "ok", db: { status: "up" }, redis: { status: "up" } }`.
- [ ] Error rate on `/metrics` is `< 0.1%`.
- [ ] P99 latency returns below `150 ms`.
- [ ] Sentry reports zero new regression issue alerts.
- [ ] Incident post-mortem ticket logged with root cause and failing tests.
