"""Synthetic Data Seeder for 500 Approved Drivers and 2,000 Subscriptions (Task 1.09 Phase 3).

Generates statistically realistic Karachi transit topology:
  - 5 major arterial transit corridors (100 drivers per corridor = 500 drivers).
  - Realistic Karachi bounding box: [24.7000, 25.1500] N, [66.8500, 67.3500] E.
  - Realistic seat capacities: 4, 7, 10, 14 seats.
  - 2,000 active subscriptions and ~4,000 schedule slots distributed across drivers.
  - Day-level departure times in driver_matching_stats (07:00-08:30 PKT).
  - Realistic rating review distribution (5-20 reviews per driver, ratings 3-5).
  - Complete isolation using '@benchmark.routeride.internal' domain and deterministic UUIDs.

CLI commands:
  python -m app.tests.perf.seed_500 --seed      # Idempotently seeds benchmark fleet
  python -m app.tests.perf.seed_500 --clean     # Deletes 100% of benchmark data
  python -m app.tests.perf.seed_500 --status    # Reports current benchmark entity counts
  python -m app.tests.perf.seed_500 --explain   # Executes EXPLAIN (ANALYZE, BUFFERS) and verifies idx_dp_route
"""

from __future__ import annotations

import argparse
import asyncio
import random
from datetime import UTC, time
from uuid import UUID, uuid5

import asyncpg
from shapely.geometry import LineString

from app.config import settings

BENCHMARK_NAMESPACE = UUID("b0000000-0000-4000-a000-000000000000")
BENCHMARK_EMAIL_DOMAIN = "@benchmark.routeride.internal"

# 5 Karachi Arterial Transit Corridors (South -> North or West -> East)
CORRIDORS = [
    {
        "id": "C1_SHAHRAH_E_FAISAL",
        "name": "Malir / Airport -> Shahrah-e-Faisal -> Metropole / Saddar",
        "waypoints": [
            (67.1600, 24.9000),
            (67.1100, 24.8850),
            (67.0650, 24.8650),
            (67.0280, 24.8520),
        ],
    },
    {
        "id": "C2_NORTH_NAZIMABAD",
        "name": "Buffer Zone -> North Nazimabad -> I.I. Chundrigar",
        "waypoints": [
            (67.0650, 24.9600),
            (67.0450, 24.9350),
            (67.0320, 24.9150),
            (67.0080, 24.8510),
        ],
    },
    {
        "id": "C3_CLIFTON_GULSHAN",
        "name": "Clifton Phase 5 -> Shahrah-e-Quaideen -> NIPA / Gulshan",
        "waypoints": [
            (67.0350, 24.8150),
            (67.0550, 24.8700),
            (67.0750, 24.8950),
            (67.0950, 24.9250),
        ],
    },
    {
        "id": "C4_JAUHAR_SEAVIEW",
        "name": "Gulistan-e-Jauhar -> Baloch Colony -> Sea View",
        "waypoints": [
            (67.1350, 24.9200),
            (67.1000, 24.8900),
            (67.0750, 24.8680),
            (67.0450, 24.7950),
        ],
    },
    {
        "id": "C5_KORANGI_SITE",
        "name": "Korangi Crossing -> KPT Interchange -> SITE Industrial",
        "waypoints": [
            (67.1150, 24.8350),
            (67.0700, 24.8450),
            (67.0350, 24.8750),
            (67.0050, 24.8950),
        ],
    },
]

VEHICLE_MODELS = [
    ("Toyota", "HiAce", 14),
    ("Toyota", "HiAce", 10),
    ("Suzuki", "Every", 7),
    ("Suzuki", "Bolan", 4),
]
COLORS = ["White", "Silver", "Grey", "Blue", "Black"]
TIERS = ["BASIC", "ENHANCED", "ELITE"]
OPERATING_DAYS_CHOICES = [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]]


def generate_jittered_polyline(
    waypoints: list[tuple[float, float]], rng: random.Random
) -> LineString:
    """Generate simple LineString with small realistic lateral jitter (+-150m)."""
    points: list[tuple[float, float]] = []
    for lon, lat in waypoints:
        d_lon = rng.uniform(-0.0015, 0.0015)
        d_lat = rng.uniform(-0.0015, 0.0015)
        points.append((round(lon + d_lon, 6), round(lat + d_lat, 6)))
    return LineString(points)


async def clean_benchmark_data(conn: asyncpg.Connection) -> int:
    """Delete all users and cascaded entities created under the benchmark domain."""
    res = await conn.execute(f"DELETE FROM users WHERE email LIKE '%{BENCHMARK_EMAIL_DOMAIN}';")
    deleted_users = int(res.split(" ")[-1]) if " " in res else 0
    # Also clean any orphaned benchmark driver profiles if any
    await conn.execute("DELETE FROM driver_profiles WHERE plate_number LIKE 'BCH-%';")
    return deleted_users


async def get_benchmark_status(conn: asyncpg.Connection) -> dict[str, int]:
    """Retrieve current counts of benchmark records in the database."""
    counts = {}
    counts["driver_users"] = await conn.fetchval(
        f"SELECT count(*) FROM users WHERE role = 'DRIVER' AND email LIKE '%{BENCHMARK_EMAIL_DOMAIN}';"
    )
    counts["consumer_users"] = await conn.fetchval(
        f"SELECT count(*) FROM users WHERE role = 'CONSUMER' AND email LIKE '%{BENCHMARK_EMAIL_DOMAIN}';"
    )
    counts["driver_profiles"] = await conn.fetchval(
        "SELECT count(*) FROM driver_profiles WHERE plate_number LIKE 'BCH-%';"
    )
    counts["approved_drivers"] = await conn.fetchval(
        "SELECT count(*) FROM driver_profiles WHERE plate_number LIKE 'BCH-%' AND status = 'APPROVED';"
    )
    counts["subscriptions"] = await conn.fetchval(
        "SELECT count(*) FROM subscriptions s JOIN driver_profiles dp ON dp.id = s.driver_profile_id WHERE dp.plate_number LIKE 'BCH-%';"
    )
    counts["schedule_slots"] = await conn.fetchval(
        "SELECT count(*) FROM driver_schedule_slots dss JOIN driver_profiles dp ON dp.id = dss.driver_profile_id WHERE dp.plate_number LIKE 'BCH-%';"
    )
    counts["matching_stats"] = await conn.fetchval(
        "SELECT count(*) FROM driver_matching_stats dms JOIN driver_profiles dp ON dp.id = dms.driver_profile_id WHERE dp.plate_number LIKE 'BCH-%';"
    )
    counts["reviews"] = await conn.fetchval(
        f"SELECT count(*) FROM reviews r JOIN users u ON u.id = r.target_id WHERE u.email LIKE '%{BENCHMARK_EMAIL_DOMAIN}';"
    )
    return counts


async def seed_benchmark_data(
    conn: asyncpg.Connection, total_drivers: int = 500, total_subs: int = 2000
) -> None:
    """Idempotently seed 500 approved drivers and 2,000 subscriptions."""
    rng = random.Random(42)  # Deterministic seed for reproducible dataset

    # Check existing count
    current_count = await conn.fetchval(
        "SELECT count(*) FROM driver_profiles WHERE plate_number LIKE 'BCH-%' AND status = 'APPROVED';"
    )
    if current_count >= total_drivers:
        print(f"Benchmark fleet already seeded ({current_count} approved drivers found).")
        return

    print("Cleaning any partial benchmark records...")
    await clean_benchmark_data(conn)

    print(f"Generating {total_drivers} drivers across 5 Karachi corridors...")

    drivers_per_corridor = total_drivers // len(CORRIDORS)

    # 1. Driver Users and Driver Profiles
    driver_user_rows = []
    driver_profile_rows = []
    stats_rows = []
    driver_ids: list[str] = []
    driver_user_ids: list[str] = []

    driver_idx = 0
    for corr in CORRIDORS:
        for _ in range(drivers_per_corridor):
            driver_idx += 1
            u_id = str(uuid5(BENCHMARK_NAMESPACE, f"driver_user_{driver_idx}"))
            dp_id = str(uuid5(BENCHMARK_NAMESPACE, f"driver_profile_{driver_idx}"))
            driver_ids.append(dp_id)
            driver_user_ids.append(u_id)

            phone = f"+923009{driver_idx:06d}"
            email = f"driver_bench_{driver_idx}{BENCHMARK_EMAIL_DOMAIN}"
            plate = f"BCH-{driver_idx:04d}"

            make, model, cap = rng.choice(VEHICLE_MODELS)
            color = rng.choice(COLORS)
            tier = rng.choice(TIERS)
            days = rng.choice(OPERATING_DAYS_CHOICES)
            price = rng.randint(350000, 750000)  # PKR 3,500 - 7,500
            waypoints: list[tuple[float, float]] = list(corr["waypoints"])  # type: ignore[arg-type]
            geom = generate_jittered_polyline(waypoints, rng)

            acc_req = rng.randint(5, 50)
            elig_req = acc_req + rng.randint(0, 10)
            acc_rate = round(acc_req / elig_req, 2)

            driver_user_rows.append(
                (u_id, f"Driver {driver_idx}", phone, email, "DRIVER", "ACTIVE", "bench_hash")
            )
            driver_profile_rows.append(
                (
                    dp_id,
                    u_id,
                    f"LIC-BCH-{driver_idx:04d}",
                    make,
                    model,
                    2021,
                    color,
                    plate,
                    cap,
                    geom.wkt,
                    days,
                    price,
                    "PKR",
                    "APPROVED",
                    tier,
                    acc_rate,
                    acc_req,
                    elig_req,
                )
            )

            # Driver matching stats (per operating day)
            dep_hour = rng.randint(7, 8)
            dep_minute = rng.choice([0, 15, 30, 45])
            obs_count = rng.randint(5, 35)
            for day in days:
                stats_id = str(uuid5(BENCHMARK_NAMESPACE, f"stats_{dp_id}_{day}"))
                stats_rows.append((stats_id, dp_id, day, time(dep_hour, dep_minute), obs_count))

    # Insert Driver Users
    await conn.executemany(
        """
        INSERT INTO users (id, full_name, phone, email, role, status, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
    """,
        driver_user_rows,
    )

    # Insert Driver Profiles with PostGIS geometry
    await conn.executemany(
        """
        INSERT INTO driver_profiles (
            id, user_id, licence_number, vehicle_make, vehicle_model, vehicle_year, vehicle_colour,
            plate_number, seat_capacity, route_polyline, operating_days, base_price_cents,
            currency, status, verification_tier, acceptance_rate, accepted_request_count, eligible_request_count
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, ST_SetSRID(ST_GeomFromText($10), 4326),
            $11, $12, $13, $14, $15, $16, $17, $18
        );
    """,
        driver_profile_rows,
    )

    # Insert Driver Matching Stats
    await conn.executemany(
        """
        INSERT INTO driver_matching_stats (id, driver_profile_id, operating_day, typical_departure_time, observation_count)
        VALUES ($1, $2, $3, $4, $5);
    """,
        stats_rows,
    )

    print(
        f"Inserted {len(driver_profile_rows)} driver profiles and {len(stats_rows)} matching stats records."
    )

    # 2. Consumer Users, Profiles, and Riders
    total_consumers = 1000
    print(f"Generating {total_consumers} consumer riders and {total_subs} subscriptions...")

    consumer_user_rows = []
    consumer_profile_rows = []
    rider_rows = []
    rider_ids: list[str] = []

    for c_idx in range(1, total_consumers + 1):
        u_id = str(uuid5(BENCHMARK_NAMESPACE, f"consumer_user_{c_idx}"))
        cp_id = str(uuid5(BENCHMARK_NAMESPACE, f"consumer_profile_{c_idx}"))
        r_id = str(uuid5(BENCHMARK_NAMESPACE, f"rider_{c_idx}"))
        rider_ids.append(r_id)

        phone = f"+923119{c_idx:06d}"
        email = f"consumer_bench_{c_idx}{BENCHMARK_EMAIL_DOMAIN}"

        home_lon = round(rng.uniform(67.0100, 67.1500), 6)
        home_lat = round(rng.uniform(24.8400, 24.9300), 6)
        dest_lon = round(rng.uniform(67.0100, 67.1500), 6)
        dest_lat = round(rng.uniform(24.8400, 24.9300), 6)

        consumer_user_rows.append(
            (u_id, f"Consumer {c_idx}", phone, email, "CONSUMER", "ACTIVE", "bench_hash")
        )
        consumer_profile_rows.append((cp_id, u_id, f"Guardian {c_idx}", phone))
        rider_rows.append(
            (
                r_id,
                cp_id,
                f"Rider {c_idx}",
                f"Home {c_idx}",
                f"POINT({home_lon} {home_lat})",
                f"Dest {c_idx}",
                f"POINT({dest_lon} {dest_lat})",
            )
        )

    await conn.executemany(
        """
        INSERT INTO users (id, full_name, phone, email, role, status, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7);
    """,
        consumer_user_rows,
    )

    await conn.executemany(
        """
        INSERT INTO consumer_profiles (id, user_id, emergency_contact_name, emergency_contact_phone)
        VALUES ($1, $2, $3, $4);
    """,
        consumer_profile_rows,
    )

    await conn.executemany(
        """
        INSERT INTO riders (id, consumer_profile_id, name, home_address_text, home_location, dest_address_text, dest_location)
        VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromText($5), 4326), $6, ST_SetSRID(ST_GeomFromText($7), 4326));
    """,
        rider_rows,
    )

    # 3. Subscriptions and Schedule Slots
    from datetime import datetime, timedelta

    now_dt = datetime.now(UTC)
    start_dt = now_dt - timedelta(days=10)
    next_bill_dt = now_dt + timedelta(days=20)
    pickup_time = datetime(2026, 1, 1, 7, 30, tzinfo=UTC)
    dropoff_time = datetime(2026, 1, 1, 8, 15, tzinfo=UTC)

    subscription_rows = []
    slot_rows = []
    review_rows = []

    sub_types = ["DEPARTURE", "ROUND_TRIP", "PICKUP"]
    for s_idx in range(1, total_subs + 1):
        sub_id = str(uuid5(BENCHMARK_NAMESPACE, f"sub_{s_idx}"))
        dp_id = driver_ids[s_idx % len(driver_ids)]  # Distribute across drivers
        r_id = rider_ids[s_idx % len(rider_ids)]
        s_type = rng.choice(sub_types)
        days = [1, 2, 3, 4, 5]

        subscription_rows.append(
            (
                sub_id,
                dp_id,
                r_id,
                "ACTIVE",
                s_type,
                450000,
                "PKR",
                "Pickup Address",
                "Dropoff Address",
                start_dt,
                next_bill_dt,
                pickup_time,
                dropoff_time,
            )
        )

        # Schedule slots
        if s_type in ("DEPARTURE", "ROUND_TRIP"):
            slot_id_m = str(uuid5(BENCHMARK_NAMESPACE, f"slot_m_{s_idx}"))
            m_start = time(7, 30)
            m_end = time(8, 0)
            slot_rows.append((slot_id_m, dp_id, sub_id, "DEPARTURE", m_start, m_end, days, 1))

        if s_type in ("PICKUP", "ROUND_TRIP"):
            slot_id_a = str(uuid5(BENCHMARK_NAMESPACE, f"slot_a_{s_idx}"))
            a_start = time(16, 30)
            a_end = time(17, 0)
            slot_rows.append((slot_id_a, dp_id, sub_id, "PICKUP", a_start, a_end, days, 1))

        # Reviews (sample ~60% of subscriptions create reviews)
        if rng.random() < 0.60:
            rev_id = str(uuid5(BENCHMARK_NAMESPACE, f"review_{s_idx}"))
            consumer_u_id = consumer_user_rows[s_idx % len(consumer_user_rows)][0]
            driver_u_id = driver_user_ids[s_idx % len(driver_user_ids)]
            rating = rng.randint(3, 5)
            review_rows.append(
                (rev_id, consumer_u_id, driver_u_id, sub_id, rating, "Punctual driver")
            )

    await conn.executemany(
        """
        INSERT INTO subscriptions (
            id, driver_profile_id, rider_id, status, type, monthly_price_cents,
            currency, pickup_address_text, dropoff_address_text, start_date, next_billing_date,
            agreed_pickup_time, agreed_dropoff_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
    """,
        subscription_rows,
    )

    await conn.executemany(
        """
        INSERT INTO driver_schedule_slots (id, driver_profile_id, subscription_id, leg_type, slot_start, slot_end, operating_days, pickup_order)
        VALUES ($1, $2, $3, $4::"ScheduleLegType", $5, $6, $7, $8);
    """,
        slot_rows,
    )

    await conn.executemany(
        """
        INSERT INTO reviews (id, author_id, target_id, subscription_id, rating, comment)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING;
    """,
        review_rows,
    )

    print(f"Inserted {len(subscription_rows)} subscriptions and {len(slot_rows)} schedule slots.")

    # 4. Critical Post-Seeding Step: Analyze Table Statistics for Cost-Based Planner
    print("Executing ANALYZE on benchmarked tables...")
    await conn.execute("ANALYZE driver_profiles;")
    await conn.execute("ANALYZE subscriptions;")
    await conn.execute("ANALYZE driver_schedule_slots;")
    await conn.execute("ANALYZE driver_matching_stats;")
    await conn.execute("ANALYZE reviews;")
    print("ANALYZE complete! Statistics are fresh.")


async def explain_candidate_query(conn: asyncpg.Connection) -> None:
    """Run EXPLAIN (ANALYZE, BUFFERS) and verify whether idx_dp_route is selected by the planner."""
    from app.matching.candidates import CANDIDATE_RETRIEVAL_SQL

    p_lon, p_lat = 67.0650, 24.8650  # Nursery, Shahrah-e-Faisal
    d_lon, d_lat = 67.0280, 24.8520  # Metropole, Saddar
    day = 1
    p_rad = 1500.0
    d_rad = 2000.0

    print("\n--- EXPLAIN (ANALYZE, BUFFERS) on Benchmark Dataset ---")
    rows = await conn.fetch(
        f"EXPLAIN (ANALYZE, BUFFERS) {CANDIDATE_RETRIEVAL_SQL}",
        p_lon,
        p_lat,
        d_lon,
        d_lat,
        day,
        p_rad,
        d_rad,
    )
    plan_text = "\n".join(r[0] for r in rows)
    print(plan_text)

    # Verification checks
    uses_index = "idx_dp_route" in plan_text
    print("\n--- Planner Index Utilization Verification ---")
    if uses_index:
        print("[SUCCESS] Query planner selected PostGIS GIST index 'idx_dp_route'!")
    else:
        print(
            "[WARNING] Query planner did not choose 'idx_dp_route' (check cost parameters or table statistics)."
        )


async def main() -> None:
    parser = argparse.ArgumentParser(description="RouteRide Matching Benchmark Seeder")
    parser.add_argument(
        "--seed", action="store_true", help="Seed 500 approved drivers and 2,000 subscriptions"
    )
    parser.add_argument("--clean", action="store_true", help="Clean all benchmark data")
    parser.add_argument("--status", action="store_true", help="Report current benchmark counts")
    parser.add_argument(
        "--explain", action="store_true", help="Run EXPLAIN (ANALYZE, BUFFERS) verification"
    )

    args = parser.parse_args()

    conn = await asyncpg.connect(settings.effective_database_url)
    try:
        if args.clean:
            deleted = await clean_benchmark_data(conn)
            print(f"Cleaned {deleted} benchmark user records and all related data.")
        elif args.status:
            status = await get_benchmark_status(conn)
            print("Current Benchmark Fleet Status:")
            for k, v in status.items():
                print(f"  {k:22s}: {v}")
        elif args.explain:
            await explain_candidate_query(conn)
        elif args.seed:
            await seed_benchmark_data(conn)
            status = await get_benchmark_status(conn)
            print("\nFinal Benchmark Status:")
            for k, v in status.items():
                print(f"  {k:22s}: {v}")
        else:
            parser.print_help()
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
