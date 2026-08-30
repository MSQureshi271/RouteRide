/**
 * AuthService — registration and login business logic.
 *
 * Registration rules (T0.25):
 *  - bcrypt cost 12
 *  - Zod validation at boundary (done by controller via contracts)
 *  - Role restricted to CONSUMER or DRIVER (contracts schema enforces this)
 *  - Caller cannot self-assign ADMIN / INSTITUTION_ADMIN / FLEET_ADMIN
 *  - Duplicate phone → 409 ConflictException
 *  - User created as PENDING_VERIFICATION
 *  - Response never contains passwordHash
 *
 * Login rules:
 *  - Compare bcrypt hash; incorrect password → 401
 *  - Suspended/Deleted user → 401
 */
import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { hash, compare } from "bcrypt";
import { PrismaService } from "../prisma/prisma.service.js";
import { TokenService } from "./token.service.js";
import type {
  RegisterRequest,
  LoginRequest,
  UserSummary,
  AuthTokens,
} from "@routeride/contracts";

const BCRYPT_ROUNDS = 12;

interface DbUserRow {
  id: string;
  phone: string;
  full_name: string;
  role: string;
  status: string;
  email: string | null;
  profile_photo_url: string | null;
  created_at: string | Date;
  password_hash?: string | null;
  driver_profile_id?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  // ─── Register ──────────────────────────────────────────────────────────────

  async register(
    dto: RegisterRequest,
  ): Promise<{ user: UserSummary; message: string }> {
    // Check for duplicate phone
    const existing = (await this.prisma.sql`
      SELECT id FROM users WHERE phone = ${dto.phone} LIMIT 1
    `) as unknown as { id: string }[];

    if (existing.length > 0) {
      throw new ConflictException(
        "A user with this phone number already exists",
      );
    }

    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);

    const insertedRows = (await this.prisma.sql`
      INSERT INTO users (phone, full_name, password_hash, role, status, email)
      VALUES (
        ${dto.phone},
        ${dto.fullName},
        ${passwordHash},
        ${dto.role}::user_role,
        'PENDING_VERIFICATION'::user_status,
        ${dto.email ?? null}
      )
      RETURNING id, phone, full_name, role, status, email, profile_photo_url, created_at
    `) as unknown as DbUserRow[];

    const user = insertedRows[0];
    if (!user) {
      throw new Error("Failed to create user record");
    }

    this.logger.log({
      event: "user.registered",
      userId: user.id,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.full_name,
        role: user.role as UserSummary["role"],
        status: user.status as UserSummary["status"],
        email: user.email ?? null,
        profilePhotoUrl: user.profile_photo_url ?? null,
        createdAt: new Date(user.created_at).toISOString(),
      },
      message: "Registration successful. Please verify your phone number.",
    };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(
    dto: LoginRequest,
  ): Promise<{ user: UserSummary; tokens: AuthTokens }> {
    const userRows = (await this.prisma.sql`
      SELECT u.id, u.phone, u.full_name, u.role, u.status, u.email,
             u.profile_photo_url, u.created_at, u.password_hash,
             dp.id AS driver_profile_id
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.phone = ${dto.phone}
      LIMIT 1
    `) as unknown as DbUserRow[];

    const user = userRows[0];

    // Use a constant-time compare path regardless of user existence
    const dummyHash =
      "$2b$12$invalidhashfortimingprotectionpurposesonly000000000000000";
    const hashToCompare = user?.password_hash ?? dummyHash;
    const passwordValid = await compare(dto.password, hashToCompare);

    if (!user || !passwordValid || !user.password_hash) {
      throw new UnauthorizedException("Invalid phone number or password");
    }

    if (user.status === "SUSPENDED") {
      throw new UnauthorizedException("This account has been suspended");
    }

    if (user.status === "DELETED") {
      throw new UnauthorizedException("This account no longer exists");
    }

    const tokens = await this.tokenService.issueTokenPair(
      user.id,
      user.role,
      user.status,
      user.driver_profile_id ?? undefined,
    );

    this.logger.log({ event: "user.login", userId: user.id });

    return {
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.full_name,
        role: user.role as UserSummary["role"],
        status: user.status as UserSummary["status"],
        email: user.email ?? null,
        profilePhotoUrl: user.profile_photo_url ?? null,
        createdAt: new Date(user.created_at).toISOString(),
      },
      tokens,
    };
  }
}
