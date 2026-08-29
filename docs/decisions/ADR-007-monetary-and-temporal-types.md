# ADR-007: Monetary and Temporal Data Types and Timezone Architecture

## Status

Accepted

## Date

2026-08-25

## Context

Ride matching, billing calculations, and schedule conflict resolution are extremely sensitive to numeric precision, rounding anomalies, and timezone shifts:

- Floating-point representations (e.g. `FLOAT`, `DOUBLE`, `REAL`) introduce IEEE 754 precision rounding errors in financial transactions (e.g., `0.1 + 0.2 = 0.30000000000000004`).
- Ambiguous timestamp formats without explicit UTC offsets cause silent shift bugs during Daylight Saving Time (DST) changes or across multi-city launches.
- Daily recurring driver route schedules (e.g., "pickup every Monday at 07:30 AM") cannot be stored as absolute historical timestamps without decoupling the clock time from the local city timezone.

## Decision

1. **Monetary Values**:
   - Store all prices, fees, payouts, balances, and refund amounts as **`INTEGER` cents** (the smallest currency unit, e.g. `$25.00` = `2500`).
   - Associate every money field with an ISO-4217 currency code (defaulting to `PKR` or `USD`).
   - Forbid floating-point calculations for financial amounts; use integer arithmetic in backend services.

2. **Absolute Timestamps**:
   - Store all point-in-time events (e.g. `created_at`, `updated_at`, `started_at`, `completed_at`, `sent_at`) as PostgreSQL **`TIMESTAMPTZ`** (Timestamp with Time Zone), normalized and stored in **UTC**.
   - Serialize all timestamps over HTTP/WebSocket APIs as standard ISO-8601 strings (e.g., `2026-08-29T11:45:00.000Z`).

3. **Recurring Route Schedules**:
   - Store recurring pickup/departure times as PostgreSQL **`TIME`** without timezone (e.g. `07:30:00`), coupled with an explicit `timezone` column (e.g., `Asia/Karachi`) on the parent `cities` / `routes` table.
   - Schedule calculations construct UTC target execution dates using `date-fns-tz` or Python `zoneinfo` explicitly against the city's IANA timezone.

## Alternatives Considered

### 1. PostgreSQL `DECIMAL` / `NUMERIC(10, 2)` for Money

- _Pros_: Human readable directly in database client tools.
- _Cons_: Slower computation in high-throughput matching algorithms; serialization mismatches in JSON where numbers may convert to floats.
- _Rejected_: Integer cents is the universal standard used by Stripe, ISO-4217, and high-reliability financial systems.

### 2. Epoch Milliseconds (Integers) for Timestamps

- _Pros_: Fast integer comparisons.
- _Cons_: Loses timezone context; unreadable in database inspection; lacks rich PostgreSQL SQL date manipulation functions.
- _Rejected_: `TIMESTAMPTZ` gives full SQL date arithmetic support with microsecond precision in UTC.

## Consequences

- **Positive**: Zero floating-point rounding errors in billing, payouts, or fare calculations.
- **Positive**: Robust timezone isolation across recurring ride schedules and multiple launch cities.
- **Negative**: Frontend clients and admin dashboards must format cents into display decimals (e.g., `$25.00`).
