/**
 * DocumentsController — driver document upload via pre-signed S3 URLs (T0.38).
 *
 * Route prefix: /drivers/me/documents (under /api/v1)
 *
 * Flow:
 *  1. Driver calls POST /drivers/me/documents/upload-url → receives a pre-signed PUT URL
 *  2. Driver uploads the file directly to S3 (client-to-S3, bypasses API)
 *  3. Driver calls POST /drivers/me/documents/confirm → server validates magic bytes
 *     and records the document in driver_documents
 *
 * Security:
 *  - All endpoints require JWT + DRIVER role
 *  - Objects are never publicly accessible (ACL private by default)
 *  - Only CNIC, LICENCE, REGISTRATION, INSURANCE doc types accepted
 *  - Magic bytes are validated server-side on confirmation
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import {
  CurrentUser,
  type JwtPayload,
} from "../common/decorators/current-user.decorator.js";
import { S3Service } from "../storage/s3.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";

// ─── Accepted document types ──────────────────────────────────────────────────

const ACCEPTED_DOC_TYPES = [
  "CNIC",
  "LICENCE",
  "REGISTRATION",
  "INSURANCE",
] as const;
type DocType = (typeof ACCEPTED_DOC_TYPES)[number];

// ─── Request schemas ──────────────────────────────────────────────────────────

const UploadUrlRequestSchema = z
  .object({
    docType: z.enum(ACCEPTED_DOC_TYPES),
    mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
    expiryDate: z.string().date().optional(), // ISO date string (YYYY-MM-DD)
  })
  .strict();

const ConfirmUploadSchema = z
  .object({
    key: z.string().min(1).max(512),
    docType: z.enum(ACCEPTED_DOC_TYPES),
    mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
    expiryDate: z.string().date().optional(),
  })
  .strict();

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller("drivers/me/documents")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("DRIVER")
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly s3: S3Service,
    private readonly prisma: PrismaService,
  ) {}

  // ── Step 0: List confirmed documents for authenticated driver ──────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  async getMyDocuments(@CurrentUser() user: JwtPayload) {
    const profileRows = (await this.prisma.sql`
      SELECT id FROM driver_profiles WHERE user_id = ${user.sub} LIMIT 1
    `) as unknown as { id: string }[];

    if (profileRows.length === 0) {
      throw new BadRequestException("Driver profile not found");
    }

    const driverId = profileRows[0]!.id;

    const docRows = (await this.prisma.sql`
      SELECT id, driver_id, doc_type, s3_key, expiry_date, verified_at, created_at
      FROM driver_documents
      WHERE driver_id = ${driverId}
      ORDER BY created_at DESC
    `) as unknown as {
      id: string;
      driver_id: string;
      doc_type: DocType;
      s3_key: string;
      expiry_date: string | null;
      verified_at: string | null;
      created_at: string;
    }[];

    return docRows.map((doc) => ({
      id: doc.id,
      driverId: doc.driver_id,
      docType: doc.doc_type,
      s3Key: doc.s3_key,
      expiryDate: doc.expiry_date,
      verifiedAt: doc.verified_at
        ? new Date(doc.verified_at).toISOString()
        : null,
      createdAt: new Date(doc.created_at).toISOString(),
    }));
  }

  // ── Step 1: Issue pre-signed PUT URL ──────────────────────────────────────

  @Post("upload-url")
  @HttpCode(HttpStatus.OK)
  async getUploadUrl(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const parsed = UploadUrlRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    // Fetch the driver profile id
    const profileRows = (await this.prisma.sql`
      SELECT id FROM driver_profiles WHERE user_id = ${user.sub} LIMIT 1
    `) as unknown as { id: string }[];

    if (profileRows.length === 0) {
      throw new BadRequestException(
        "Complete driver onboarding before uploading documents",
      );
    }

    const driverId = profileRows[0]!.id;
    const key = `drivers/${driverId}/${parsed.data.docType.toLowerCase()}/${randomUUID()}`;

    const result = await this.s3.getUploadUrl(key, parsed.data.mimeType);

    return {
      uploadUrl: result.uploadUrl,
      key: result.key,
      expiresAt: result.expiresAt,
    };
  }

  // ── Step 2: Confirm upload — validate magic bytes and record document ──────

  @Post("confirm")
  @HttpCode(HttpStatus.CREATED)
  async confirmUpload(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const parsed = ConfirmUploadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    // Validate magic bytes against S3
    await this.s3.confirmUpload(parsed.data.key, parsed.data.mimeType);

    // Fetch the driver profile id
    const profileRows = (await this.prisma.sql`
      SELECT id FROM driver_profiles WHERE user_id = ${user.sub} LIMIT 1
    `) as unknown as { id: string }[];

    if (profileRows.length === 0) {
      throw new BadRequestException("Driver profile not found");
    }

    const driverId = profileRows[0]!.id;

    // Record the document in driver_documents with UPSERT on (driver_id, doc_type)
    const docRows = (await this.prisma.sql`
      INSERT INTO driver_documents (driver_id, doc_type, s3_key, expiry_date)
      VALUES (
        ${driverId},
        ${parsed.data.docType},
        ${parsed.data.key},
        ${parsed.data.expiryDate ?? null}::date
      )
      ON CONFLICT (driver_id, doc_type)
      DO UPDATE SET
        s3_key = EXCLUDED.s3_key,
        expiry_date = EXCLUDED.expiry_date,
        verified_at = NULL,
        verified_by = NULL,
        created_at = NOW()
      RETURNING id, driver_id, doc_type, s3_key, expiry_date, created_at
    `) as unknown as {
      id: string;
      driver_id: string;
      doc_type: DocType;
      s3_key: string;
      expiry_date: string | null;
      created_at: string;
    }[];

    const doc = docRows[0]!;

    this.logger.log({
      event: "driver.document_confirmed",
      driverId,
      docType: doc.doc_type,
    });

    return {
      id: doc.id,
      driverId: doc.driver_id,
      docType: doc.doc_type,
      expiryDate: doc.expiry_date,
      createdAt: new Date(doc.created_at).toISOString(),
    };
  }
}
