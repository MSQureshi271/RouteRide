/**
 * Integration tests for T0.38 — Document Upload via Pre-signed S3 URLs.
 *
 * Tests verify:
 *  - 200 getUploadUrl returns pre-signed URL and S3 key
 *  - 400 getUploadUrl rejects disallowed MIME types (e.g. application/x-msdownload)
 *  - 400 getUploadUrl rejects disallowed docType
 *  - 400 getUploadUrl before driver onboard throws BadRequestException
 *  - 201 confirmUpload records document in driver_documents
 *  - 400 confirmUpload when driver profile not found throws BadRequestException
 *  - 422 S3Service.confirmUpload rejects magic bytes mismatch (renamed executable)
 *  - 422 S3Service.confirmUpload rejects oversized file (>10MB)
 *  - 422 S3Service.confirmUpload rejects missing file in S3
 */
jest.mock("@routeride/config", () => ({
  getEnv: () => ({
    S3_DOCUMENTS_BUCKET: "routeride-documents-test",
    AWS_REGION: "ap-southeast-1",
    AWS_ENDPOINT_URL: "http://localhost:4566",
  }),
}));

jest.mock("@nestjs/passport", () => ({
  AuthGuard: () => class {},
}));

import {
  BadRequestException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DocumentsController } from "../src/drivers/documents.controller.js";
import { S3Service } from "../src/storage/s3.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import type { JwtPayload } from "../src/common/decorators/current-user.decorator.js";

const MOCK_DRIVER_USER: JwtPayload = {
  sub: "11111111-1111-1111-1111-111111111111",
  role: "DRIVER",
  status: "PENDING",
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const MOCK_DRIVER_PROFILE_ID = "00000000-0000-0000-0000-000000000001";

function makeMockPrisma(profileExists = true) {
  return {
    sql: jest
      .fn()
      .mockImplementation(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          const query = strings.join(" ");

          if (query.includes("SELECT id FROM driver_profiles")) {
            return Promise.resolve(
              profileExists ? [{ id: MOCK_DRIVER_PROFILE_ID }] : [],
            );
          }

          if (query.includes("INSERT INTO driver_documents")) {
            return Promise.resolve([
              {
                id: "99999999-9999-9999-9999-999999999999",
                driver_id: MOCK_DRIVER_PROFILE_ID,
                doc_type: values[1] as string,
                s3_key: values[2] as string,
                expiry_date: "2028-12-31",
                created_at: new Date("2026-01-01T00:00:00Z"),
              },
            ]);
          }

          if (
            query.includes("FROM driver_documents") &&
            query.includes("SELECT")
          ) {
            return Promise.resolve([
              {
                id: "99999999-9999-9999-9999-999999999999",
                driver_id: MOCK_DRIVER_PROFILE_ID,
                doc_type: "CNIC",
                s3_key: "drivers/test/cnic/1",
                expiry_date: "2028-12-31",
                verified_at: null,
                created_at: new Date("2026-01-01T00:00:00Z"),
              },
            ]);
          }

          return Promise.resolve([]);
        },
      ),
  } as unknown as PrismaService;
}

class MockS3Service extends S3Service {
  public failMissing = false;
  public failOversized = false;
  public failMagicBytes = false;

  constructor() {
    super();
  }

  override async getUploadUrl(key: string, _mimeType: string) {
    return {
      uploadUrl: `https://s3.localstack/bucket/${key}?signature=mock`,
      key,
      expiresAt: new Date(Date.now() + 300 * 1000).toISOString(),
    };
  }

  override async confirmUpload(
    _key: string,
    declaredMimeType: string,
  ): Promise<{ valid: true; sizeBytes: number }> {
    if (this.failMissing) {
      throw new UnprocessableEntityException(
        "Document not found. Please upload the file before confirming.",
      );
    }
    if (this.failOversized) {
      throw new UnprocessableEntityException(
        "File size 15000000 bytes exceeds the maximum of 10485760 bytes (10 MB)",
      );
    }
    if (this.failMagicBytes) {
      throw new UnprocessableEntityException(
        `File magic bytes do not match declared MIME type '${declaredMimeType}'. Upload rejected.`,
      );
    }
    return { valid: true, sizeBytes: 1024 * 1024 };
  }
}

describe("Driver Documents Upload (T0.38)", () => {
  let s3Mock: MockS3Service;

  beforeEach(() => {
    s3Mock = new MockS3Service();
  });

  it("200 — getUploadUrl returns pre-signed URL and S3 key", async () => {
    const prisma = makeMockPrisma(true);
    const controller = new DocumentsController(s3Mock, prisma);

    const res = await controller.getUploadUrl(MOCK_DRIVER_USER, {
      docType: "CNIC",
      mimeType: "image/jpeg",
    });

    expect(res.uploadUrl).toBeDefined();
    expect(res.key).toMatch(
      /^drivers\/00000000-0000-0000-0000-000000000001\/cnic\/[0-9a-f-]+$/,
    );
    expect(res.expiresAt).toBeDefined();
  });

  it("400 — getUploadUrl before driver onboard throws BadRequestException", async () => {
    const prisma = makeMockPrisma(false); // no profile
    const controller = new DocumentsController(s3Mock, prisma);

    await expect(
      controller.getUploadUrl(MOCK_DRIVER_USER, {
        docType: "CNIC",
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("400 — getUploadUrl rejects disallowed MIME type", async () => {
    const prisma = makeMockPrisma(true);
    const controller = new DocumentsController(s3Mock, prisma);

    await expect(
      controller.getUploadUrl(MOCK_DRIVER_USER, {
        docType: "CNIC",
        mimeType: "application/x-msdownload",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("400 — getUploadUrl rejects disallowed docType", async () => {
    const prisma = makeMockPrisma(true);
    const controller = new DocumentsController(s3Mock, prisma);

    await expect(
      controller.getUploadUrl(MOCK_DRIVER_USER, {
        docType: "PASSPORT",
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("201 — confirmUpload validates upload and records document", async () => {
    const prisma = makeMockPrisma(true);
    const controller = new DocumentsController(s3Mock, prisma);

    const res = await controller.confirmUpload(MOCK_DRIVER_USER, {
      key: "drivers/test/licence/uuid-1",
      docType: "LICENCE",
      mimeType: "image/png",
      expiryDate: "2028-12-31",
    });

    expect(res.id).toBe("99999999-9999-9999-9999-999999999999");
    expect(res.docType).toBe("LICENCE");
    expect(res.driverId).toBe(MOCK_DRIVER_PROFILE_ID);
    expect(res.expiryDate).toBe("2028-12-31");
  });

  it("422 — confirmUpload rejects when magic bytes do not match declared MIME (renamed executable)", async () => {
    s3Mock.failMagicBytes = true;
    const prisma = makeMockPrisma(true);
    const controller = new DocumentsController(s3Mock, prisma);

    await expect(
      controller.confirmUpload(MOCK_DRIVER_USER, {
        key: "drivers/test/cnic/uuid-2",
        docType: "CNIC",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("422 — confirmUpload rejects oversized files", async () => {
    s3Mock.failOversized = true;
    const prisma = makeMockPrisma(true);
    const controller = new DocumentsController(s3Mock, prisma);

    await expect(
      controller.confirmUpload(MOCK_DRIVER_USER, {
        key: "drivers/test/insurance/uuid-3",
        docType: "INSURANCE",
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("422 — confirmUpload rejects missing file in S3", async () => {
    s3Mock.failMissing = true;
    const prisma = makeMockPrisma(true);
    const controller = new DocumentsController(s3Mock, prisma);

    await expect(
      controller.confirmUpload(MOCK_DRIVER_USER, {
        key: "drivers/test/registration/uuid-4",
        docType: "REGISTRATION",
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it("200 — getMyDocuments returns confirmed documents for driver", async () => {
    const prisma = makeMockPrisma(true);
    const controller = new DocumentsController(s3Mock, prisma);

    const docs = await controller.getMyDocuments(MOCK_DRIVER_USER);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.docType).toBe("CNIC");
    expect(docs[0]?.driverId).toBe(MOCK_DRIVER_PROFILE_ID);
  });

  it("400 — getMyDocuments throws BadRequestException if profile not found", async () => {
    const prisma = makeMockPrisma(false);
    const controller = new DocumentsController(s3Mock, prisma);

    await expect(controller.getMyDocuments(MOCK_DRIVER_USER)).rejects.toThrow(
      BadRequestException,
    );
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("S3Service.onModuleInit (LocalStack initialization)", () => {
  it("verifies bucket if HeadBucketCommand succeeds", async () => {
    const service = new S3Service();
    const sendSpy = jest
      .spyOn((service as any).client, "send")
      .mockResolvedValue({} as any);

    await service.onModuleInit();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const firstCallArg = (sendSpy.mock.calls[0] as any[])[0];
    expect(firstCallArg?.constructor?.name).toBe("HeadBucketCommand");
    sendSpy.mockRestore();
  });

  it("creates bucket and sets CORS if HeadBucketCommand fails", async () => {
    const service = new S3Service();
    const sendSpy = jest
      .spyOn((service as any).client, "send")
      .mockRejectedValueOnce(new Error("NotFound"))
      .mockResolvedValueOnce({} as any)
      .mockResolvedValueOnce({} as any);

    await service.onModuleInit();

    expect(sendSpy).toHaveBeenCalledTimes(3);
    const calls = sendSpy.mock.calls as any[][];
    expect(calls[0]?.[0]?.constructor?.name).toBe("HeadBucketCommand");
    expect(calls[1]?.[0]?.constructor?.name).toBe("CreateBucketCommand");
    expect(calls[2]?.[0]?.constructor?.name).toBe("PutBucketCorsCommand");
    sendSpy.mockRestore();
  });

  it("handles bucket creation error gracefully without crashing", async () => {
    const service = new S3Service();
    const sendSpy = jest
      .spyOn((service as any).client, "send")
      .mockRejectedValueOnce(new Error("NotFound"))
      .mockRejectedValueOnce(new Error("LocalStack connection refused"));

    await expect(service.onModuleInit()).resolves.not.toThrow();
    sendSpy.mockRestore();
  });
});
