-- Synthetic local fixtures for exercising service-area driver discovery.
-- Safe to rerun: only the seven explicitly named demo accounts below are removed.
BEGIN;

DELETE FROM users
WHERE email = ANY (ARRAY[
  'demo-search-driver-001@routeride.invalid',
  'demo-search-driver-002@routeride.invalid',
  'demo-search-driver-003@routeride.invalid',
  'demo-search-driver-004@routeride.invalid',
  'demo-search-driver-005@routeride.invalid',
  'demo-search-driver-006@routeride.invalid',
  'demo-search-driver-007@routeride.invalid'
]);

INSERT INTO users (id, email, phone, role, status, full_name)
VALUES
  ('70000000-0000-4000-8000-000000000001', 'demo-search-driver-001@routeride.invalid', '+19995550101', 'DRIVER', 'ACTIVE', '[DEMO] Exact Corridor Driver'),
  ('70000000-0000-4000-8000-000000000002', 'demo-search-driver-002@routeride.invalid', '+19995550102', 'DRIVER', 'ACTIVE', '[DEMO] Nearby Corridor Driver'),
  ('70000000-0000-4000-8000-000000000003', 'demo-search-driver-003@routeride.invalid', '+19995550103', 'DRIVER', 'ACTIVE', '[DEMO] Route-Free Driver'),
  ('70000000-0000-4000-8000-000000000004', 'demo-search-driver-004@routeride.invalid', '+19995550104', 'DRIVER', 'ACTIVE', '[DEMO] Distant Route Driver'),
  ('70000000-0000-4000-8000-000000000005', 'demo-search-driver-005@routeride.invalid', '+19995550105', 'DRIVER', 'ACTIVE', '[DEMO] Morning-Only Driver'),
  ('70000000-0000-4000-8000-000000000006', 'demo-search-driver-006@routeride.invalid', '+19995550106', 'DRIVER', 'ACTIVE', '[DEMO] Partial-Coverage Driver'),
  ('70000000-0000-4000-8000-000000000007', 'demo-search-driver-007@routeride.invalid', '+19995550107', 'DRIVER', 'ACTIVE', '[DEMO] Not-Accepting Driver');

INSERT INTO driver_profiles (
  id, user_id, licence_number, vehicle_make, vehicle_model, vehicle_year,
  vehicle_colour, plate_number, seat_capacity, route_polyline, route_state,
  service_area, starting_location, accepting_requests, coverage_setup_required,
  availability_version, roster_version, operating_days, base_price_cents,
  currency, status, verification_tier
)
VALUES
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'DEMO-LIC-001', 'Toyota', 'Corolla', 2022, 'White', 'DEMO-001', 4,
   ST_GeomFromText('LINESTRING(67.05636 24.95916,67.043 24.920,67.030 24.880,67.01313 24.81328)',4326), 'ESTABLISHED',
   ST_GeomFromText('POLYGON((66.98 24.78,67.13 24.78,67.13 25.02,66.98 25.02,66.98 24.78))',4326),
   ST_GeomFromText('POINT(67.05636 24.95916)',4326), TRUE, FALSE, 1, 0, ARRAY[1,2,3,4,5], 1800000, 'PKR', 'APPROVED', 'ENHANCED'),
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'DEMO-LIC-002', 'Honda', 'City', 2021, 'Silver', 'DEMO-002', 2,
   ST_GeomFromText('LINESTRING(67.061 24.958,67.048 24.920,67.035 24.880,67.019 24.813)',4326), 'ESTABLISHED',
   ST_GeomFromText('POLYGON((66.98 24.78,67.13 24.78,67.13 25.02,66.98 25.02,66.98 24.78))',4326),
   ST_GeomFromText('POINT(67.061 24.958)',4326), TRUE, FALSE, 1, 0, ARRAY[1,2,3,4,5], 1650000, 'PKR', 'APPROVED', 'BASIC'),
  ('71000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', 'DEMO-LIC-003', 'Suzuki', 'Cultus', 2023, 'Blue', 'DEMO-003', 3,
   NULL, 'UNSET', ST_GeomFromText('POLYGON((66.98 24.78,67.13 24.78,67.13 25.02,66.98 25.02,66.98 24.78))',4326),
   ST_GeomFromText('POINT(67.05636 24.95916)',4326), TRUE, FALSE, 1, 0, ARRAY[1,2,3,4,5], 1500000, 'PKR', 'APPROVED', 'BASIC'),
  ('71000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000004', 'DEMO-LIC-004', 'Kia', 'Sportage', 2022, 'Black', 'DEMO-004', 5,
   ST_GeomFromText('LINESTRING(67.110 24.990,67.115 24.940,67.105 24.880,67.100 24.820)',4326), 'ESTABLISHED',
   ST_GeomFromText('POLYGON((66.98 24.78,67.13 24.78,67.13 25.02,66.98 25.02,66.98 24.78))',4326),
   ST_GeomFromText('POINT(67.110 24.990)',4326), TRUE, FALSE, 1, 0, ARRAY[1,2,3,4,5], 2100000, 'PKR', 'APPROVED', 'ENHANCED'),
  ('71000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000005', 'DEMO-LIC-005', 'Toyota', 'Yaris', 2020, 'White', 'DEMO-005', 3,
   ST_GeomFromText('LINESTRING(67.05636 24.95916,67.043 24.920,67.030 24.880,67.01313 24.81328)',4326), 'ESTABLISHED',
   ST_GeomFromText('POLYGON((66.98 24.78,67.13 24.78,67.13 25.02,66.98 25.02,66.98 24.78))',4326),
   ST_GeomFromText('POINT(67.05636 24.95916)',4326), TRUE, FALSE, 1, 0, ARRAY[1,2,3,4,5], 1550000, 'PKR', 'APPROVED', 'BASIC'),
  ('71000000-0000-4000-8000-000000000006', '70000000-0000-4000-8000-000000000006', 'DEMO-LIC-006', 'Honda', 'BR-V', 2021, 'Grey', 'DEMO-006', 4,
   ST_GeomFromText('LINESTRING(67.05636 24.95916,67.043 24.920,67.030 24.880,67.01313 24.81328)',4326), 'ESTABLISHED',
   ST_GeomFromText('POLYGON((66.98 24.78,67.05 24.78,67.05 25.02,66.98 25.02,66.98 24.78))',4326),
   ST_GeomFromText('POINT(67.040 24.959)',4326), TRUE, FALSE, 1, 0, ARRAY[1,2,3,4,5], 1700000, 'PKR', 'APPROVED', 'BASIC'),
  ('71000000-0000-4000-8000-000000000007', '70000000-0000-4000-8000-000000000007', 'DEMO-LIC-007', 'Suzuki', 'Every', 2020, 'White', 'DEMO-007', 6,
   NULL, 'UNSET', ST_GeomFromText('POLYGON((66.98 24.78,67.13 24.78,67.13 25.02,66.98 25.02,66.98 24.78))',4326),
   ST_GeomFromText('POINT(67.05636 24.95916)',4326), FALSE, FALSE, 1, 0, ARRAY[1,2,3,4,5], 1400000, 'PKR', 'APPROVED', 'BASIC');

-- Available 07:30-09:30 and 15:30-17:30 on each working day.
INSERT INTO driver_availability (id, driver_profile_id, operating_day, leg_type, window_start, window_end)
SELECT md5(dp.id || ':' || day_num || ':' || leg)::uuid, dp.id, day_num,
       leg::"ScheduleLegType",
       CASE leg WHEN 'MORNING' THEN TIME '07:30' ELSE TIME '15:30' END,
       CASE leg WHEN 'MORNING' THEN TIME '09:30' ELSE TIME '17:30' END
FROM driver_profiles dp
CROSS JOIN generate_series(1,5) AS day_num
CROSS JOIN (VALUES ('MORNING'),('AFTERNOON')) AS legs(leg)
WHERE dp.id IN (
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000003',
  '71000000-0000-4000-8000-000000000004',
  '71000000-0000-4000-8000-000000000006',
  '71000000-0000-4000-8000-000000000007'
);

-- This driver intentionally has only the morning leg and must not appear for a round trip.
INSERT INTO driver_availability (id, driver_profile_id, operating_day, leg_type, window_start, window_end)
SELECT md5(dp.id || ':' || day_num || ':MORNING')::uuid, dp.id, day_num,
       'MORNING'::"ScheduleLegType", TIME '07:30', TIME '09:30'
FROM driver_profiles dp
CROSS JOIN generate_series(1,5) AS day_num
WHERE dp.id = '71000000-0000-4000-8000-000000000005';

UPDATE driver_profiles SET updated_at = now()
WHERE id IN (
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000003',
  '71000000-0000-4000-8000-000000000004',
  '71000000-0000-4000-8000-000000000005',
  '71000000-0000-4000-8000-000000000006',
  '71000000-0000-4000-8000-000000000007'
);

COMMIT;
