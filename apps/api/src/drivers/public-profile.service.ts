import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DriverPublicProfileSchema,
  type DriverDiscoveryQueryV2,
  type RequestedLegV2,
} from "@routeride/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { RequestabilityService } from "../subscriptions/requestability.service.js";

@Injectable()
export class PublicProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestability: RequestabilityService,
  ) {}

  async get(
    userId: string,
    driverId: string,
    query: DriverDiscoveryQueryV2,
    reviewsPage: number,
  ) {
    const riders = await this.prisma.query<{
      owner: string;
      home_lat: number | null;
      home_lng: number | null;
      dest_lat: number | null;
      dest_lng: number | null;
    }>(
      `
      SELECT cp.user_id AS owner, ST_Y(r.home_location::geometry) AS home_lat,
        ST_X(r.home_location::geometry) AS home_lng, ST_Y(r.dest_location::geometry) AS dest_lat,
        ST_X(r.dest_location::geometry) AS dest_lng
      FROM riders r JOIN consumer_profiles cp ON cp.id=r.consumer_profile_id WHERE r.id=$1`,
      [query.riderId],
    );
    const rider = riders[0];
    if (!rider) throw new NotFoundException("Rider not found");
    if (rider.owner !== userId)
      throw new ForbiddenException("You do not have access to this rider");
    const pickupLat = query.pickupLat ?? rider.home_lat;
    const pickupLng = query.pickupLng ?? rider.home_lng;
    const destLat = query.destLat ?? rider.dest_lat;
    const destLng = query.destLng ?? rider.dest_lng;
    if (
      pickupLat === null ||
      pickupLng === null ||
      destLat === null ||
      destLng === null
    )
      throw new BadRequestException(
        "Set pickup and destination locations before reviewing a driver",
      );
    const legs: RequestedLegV2[] = [
      {
        legType: "DEPARTURE",
        pickupLocation: { type: "Point", coordinates: [pickupLng, pickupLat] },
        dropoffLocation: { type: "Point", coordinates: [destLng, destLat] },
        pickupWindowStart: query.departureTime,
        pickupWindowEnd: query.departureTime,
        arrivalDeadline: query.departureTime,
      },
    ];
    if (query.subscriptionType === "ROUND_TRIP" && query.pickupTime)
      legs.push({
        ...legs[0]!,
        legType: "PICKUP",
        pickupLocation: legs[0]!.dropoffLocation,
        dropoffLocation: legs[0]!.pickupLocation,
        pickupWindowStart: query.pickupTime,
        pickupWindowEnd: query.pickupTime,
        arrivalDeadline: query.pickupTime,
      });
    const availability = await this.requestability.inspect(
      this.prisma.pool,
      driverId,
      { operatingDays: [query.day], legs },
    );
    const rows = await this.prisma.query<{
      driver_name: string;
      photo_url: string | null;
      vehicle_make: string;
      vehicle_model: string;
      vehicle_colour: string;
      vehicle_year: number;
      plate_number: string;
      verification_tier: string;
      route_state: string;
      pickup_distance: number | null;
      dest_distance: number | null;
    }>(
      `SELECT u.full_name AS driver_name, u.profile_photo_url AS photo_url,
      dp.vehicle_make, dp.vehicle_model, dp.vehicle_colour, dp.vehicle_year, dp.plate_number,
      dp.verification_tier, dp.route_state,
      CASE WHEN dp.route_state='ESTABLISHED' THEN ST_Distance(dp.route_polyline::geography, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) END AS pickup_distance,
      CASE WHEN dp.route_state='ESTABLISHED' THEN ST_Distance(dp.route_polyline::geography, ST_SetSRID(ST_MakePoint($4,$5),4326)::geography) END AS dest_distance
      FROM driver_profiles dp JOIN users u ON u.id=dp.user_id WHERE dp.id=$1`,
      [driverId, pickupLng, pickupLat, destLng, destLat],
    );
    const profile = rows[0];
    if (!profile) throw new NotFoundException("Driver not found");
    const distribution = await this.prisma.query<{
      rating: number;
      count: number;
    }>(
      `SELECT r.rating, COUNT(*)::int AS count FROM reviews r
      JOIN driver_profiles dp ON dp.user_id=r.target_id JOIN subscriptions s ON s.id=r.subscription_id
      JOIN riders rider ON rider.id=s.rider_id JOIN consumer_profiles cp ON cp.id=rider.consumer_profile_id
      WHERE dp.id=$1 AND s.driver_profile_id=dp.id AND cp.user_id=r.author_id AND EXISTS (SELECT 1 FROM trips t WHERE t.subscription_id=s.id AND t.driver_profile_id=dp.id AND t.status='COMPLETED' AND t.actual_dropoff_at <= r.created_at) GROUP BY r.rating`,
      [driverId],
    );
    const reviews = await this.prisma.query<{
      rating: number;
      comment: string | null;
      created_at: Date;
    }>(
      `SELECT r.rating,r.comment,r.created_at FROM reviews r
      JOIN driver_profiles dp ON dp.user_id=r.target_id JOIN subscriptions s ON s.id=r.subscription_id
      JOIN riders rider ON rider.id=s.rider_id JOIN consumer_profiles cp ON cp.id=rider.consumer_profile_id
      WHERE dp.id=$1 AND s.driver_profile_id=dp.id AND cp.user_id=r.author_id AND EXISTS (SELECT 1 FROM trips t WHERE t.subscription_id=s.id AND t.driver_profile_id=dp.id AND t.status='COMPLETED' AND t.actual_dropoff_at <= r.created_at)
      ORDER BY r.created_at DESC,r.id DESC LIMIT 10 OFFSET $2`,
      [driverId, (reviewsPage - 1) * 10],
    );
    const total = distribution.reduce((sum, bin) => sum + bin.count, 0);
    return DriverPublicProfileSchema.parse({
      driver: {
        driverProfileId: driverId,
        driverName: profile.driver_name,
        vehicleMake: profile.vehicle_make,
        vehicleModel: profile.vehicle_model,
        vehicleColour: profile.vehicle_colour,
        ...availability,
        availableSeats: availability.availableSeats,
        routeState: profile.route_state,
        pickupDistanceMeters: profile.pickup_distance,
        destDistanceMeters: profile.dest_distance,
        availabilityStatus: "AVAILABLE",
        reviewStatus: "REQUIRED",
        avgRating: total
          ? distribution.reduce((sum, bin) => sum + bin.rating * bin.count, 0) /
            total
          : null,
        reviewCount: total,
      },
      photoUrl: profile.photo_url,
      vehicleYear: profile.vehicle_year,
      plateNumber: profile.plate_number,
      verificationTier: profile.verification_tier,
      ratingDistribution: [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: distribution.find((bin) => bin.rating === rating)?.count ?? 0,
      })),
      reviews: reviews.map((review) => ({
        rating: review.rating,
        comment: review.comment,
        createdAt: review.created_at.toISOString(),
        verified: true,
      })),
      reviewsPagination: {
        page: reviewsPage,
        pageSize: 10,
        total,
        hasMore: reviewsPage * 10 < total,
      },
    });
  }
}
