# ADR-010: Location Telemetry Retention, Hard Purge, and Privacy Strategy

## Status

Accepted

## Date

2026-08-25

## Context

RouteRide transports minors to and from schools. Live driver and rider GPS coordinates are classified as **Sensitive Personal Data** in the Data Privacy Register (`T-D.08`).

Under GDPR/local data protection regulations and `.agents/skills/security-and-hardening`:

- Indefinite retention of children's daily transit routes creates severe security and privacy liabilities.
- Location telemetry is needed for real-time tracking, immediate parent reassurance, and short-term dispute resolution (e.g. "did the driver stop at 8:15 AM?").
- Retaining high-frequency breadcrumbs beyond dispute windows offers negligible operational value while exponentially increasing liability in the event of a breach.

## Decision

1. **30-Day Hard Retention Limit**: All raw GPS location breadcrumbs in `trip_location_logs` and driver coordinate streams are retained for exactly **30 days** from trip completion.
2. **Automated Hard Purge**: An automated daily database cleanup job executes:
   ```sql
   DELETE FROM trip_location_logs
   WHERE recorded_at < NOW() - INTERVAL '30 days';
   ```
3. **No Secondary Long-Term S3 Location Archive in MVP**: To honor the core privacy rule ("the cheapest data to protect is the data you no longer hold"), raw coordinate breadcrumbs are permanently deleted without archiving to cold S3 storage.
4. **Permanent Audit Aggregates**: High-level trip milestone records (`trips` table containing `started_at`, `completed_at`, total distance, fare, driver ID, rider ID, pickup/dropoff points) are preserved for financial auditing and accounting purposes.
5. **Log Redaction**: All application and access logs redact GPS coordinates to **2 decimal places** (~1.1 km precision) to prevent fine-grained location tracking in telemetry log sinks.

## Alternatives Considered

### Indefinite Location Archival to S3 Glacier

- _Pros_: Available for arbitrary historical analytics years later.
- _Cons_: High compliance cost; requires complex encryption, KMS key rotation, GDPR right-to-be-forgotten deletion hooks, and high risk of minor tracking leaks.
- _Rejected_: Incompatible with privacy-by-design posture for child transport.

## Consequences

- **Positive**: Strict data minimization minimizes exposure surface in the event of a security breach.
- **Positive**: Constant database table size for `trip_location_logs`, maintaining fast query performance and low storage costs.
- **Positive**: Full compliance with Data Privacy Register (`T-D.08`) and minor safety guidelines.
- **Negative**: Historical dispute resolution is limited to 30 days after trip completion.
