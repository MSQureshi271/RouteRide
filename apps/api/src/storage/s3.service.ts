/**
 * S3Service — pre-signed URL issuance and post-upload validation.
 *
 * Uses LocalStack locally (AWS_ENDPOINT_URL from env) and real S3 in prod.
 * Credentials come from the ECS task role in prod — never set in env for prod.
 *
 * Security rules (T0.38):
 *  - Only image/jpeg, image/png, application/pdf are accepted
 *  - Magic bytes must match the declared MIME type (prevents renamed executables)
 *  - Max file size: DOCUMENT_MAX_BYTES (default 10 MB)
 *  - All objects are PRIVATE — never publicly accessible
 *  - Download URLs are short-lived pre-signed GETs (admin use only)
 *  - ClamAV scan hook: a no-op stub (the actual Lambda is Phase 2, per spec)
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "@routeride/config";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Magic-byte signatures for file type detection
const MAGIC_BYTES: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadUrlResult {
  uploadUrl: string;
  key: string;
  expiresAt: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly uploadTtlSeconds = 5 * 60; // 5-minute TTL on PUT URLs
  private readonly downloadTtlSeconds = 5 * 60; // 5-minute TTL on GET URLs (admin)

  constructor() {
    const env = getEnv();
    this.bucket = env.S3_DOCUMENTS_BUCKET;
    this.client = new S3Client({
      region: env.AWS_REGION,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      ...(env.AWS_ENDPOINT_URL
        ? {
            endpoint: env.AWS_ENDPOINT_URL,
            forcePathStyle: true, // required for LocalStack
            credentials: {
              accessKeyId: process.env["AWS_ACCESS_KEY_ID"] ?? "test",
              secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] ?? "test",
            },
          }
        : {}),
    });
  }

  // ── Auto-initialize LocalStack bucket on startup ─────────────────────────

  async onModuleInit(): Promise<void> {
    const env = getEnv();
    if (!env.AWS_ENDPOINT_URL) {
      return;
    }

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`S3 bucket '${this.bucket}' verified.`);
    } catch {
      this.logger.warn(
        `S3 bucket '${this.bucket}' not found. Initializing bucket in LocalStack...`,
      );
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        await this.client.send(
          new PutBucketCorsCommand({
            Bucket: this.bucket,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedHeaders: ["*"],
                  AllowedMethods: ["GET", "PUT", "POST", "HEAD", "DELETE"],
                  AllowedOrigins: ["*"],
                  MaxAgeSeconds: 3000,
                },
              ],
            },
          }),
        );
        this.logger.log(
          `S3 bucket '${this.bucket}' created with CORS configuration.`,
        );
      } catch (createErr) {
        this.logger.error(
          `Failed to initialize bucket '${this.bucket}' in LocalStack: ${
            createErr instanceof Error ? createErr.message : String(createErr)
          }`,
        );
      }
    }
  }

  // ── Issue a pre-signed PUT URL ────────────────────────────────────────────

  async getUploadUrl(key: string, mimeType: string): Promise<UploadUrlResult> {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        `MIME type '${mimeType}' is not accepted. Allowed: image/jpeg, image/png, application/pdf`,
      );
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.uploadTtlSeconds,
    });

    const expiresAt = new Date(
      Date.now() + this.uploadTtlSeconds * 1000,
    ).toISOString();

    this.logger.log({
      event: "s3.upload_url_issued",
      key,
      mimeType,
    });

    return { uploadUrl, key, expiresAt };
  }

  // ── Confirm upload: validate magic bytes and size ─────────────────────────

  async confirmUpload(
    key: string,
    declaredMimeType: string,
  ): Promise<{ valid: true; sizeBytes: number }> {
    if (!ALLOWED_MIME_TYPES.has(declaredMimeType)) {
      throw new BadRequestException(
        `MIME type '${declaredMimeType}' is not accepted`,
      );
    }

    // Fetch object metadata to check size
    let contentLength: number;
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      contentLength = head.ContentLength ?? 0;
    } catch {
      throw new UnprocessableEntityException(
        "Document not found. Please upload the file before confirming.",
      );
    }

    if (contentLength > DOCUMENT_MAX_BYTES) {
      throw new UnprocessableEntityException(
        `File size ${contentLength} bytes exceeds the maximum of ${DOCUMENT_MAX_BYTES} bytes (10 MB)`,
      );
    }

    // Fetch first 8 bytes to validate magic bytes
    const rangeCommand = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Range: "bytes=0-7",
    });

    const rangeResponse = await this.client.send(rangeCommand);
    const chunks: Uint8Array[] = [];
    if (rangeResponse.Body) {
      for await (const chunk of rangeResponse.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
    }
    const headerBytes = Buffer.concat(chunks);

    const expectedSignatures = MAGIC_BYTES[declaredMimeType] ?? [];
    const magicValid = expectedSignatures.some((sig) =>
      sig.every((byte, i) => headerBytes[i] === byte),
    );

    if (!magicValid) {
      throw new UnprocessableEntityException(
        `File magic bytes do not match declared MIME type '${declaredMimeType}'. Upload rejected.`,
      );
    }

    // ClamAV stub — Phase 2 Lambda scan hook
    this.logger.log({
      event: "s3.upload_confirmed",
      key,
      declaredMimeType,
      sizeBytes: contentLength,
      clamavScan: "stub_phase2",
    });

    return { valid: true, sizeBytes: contentLength };
  }

  // ── Issue a short-lived GET URL (admin use only) ──────────────────────────

  async getDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: this.downloadTtlSeconds,
    });
  }
}
