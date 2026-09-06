/* eslint-disable @typescript-eslint/no-explicit-any */
import { WorkerDatabaseService } from "./database.service";

describe("WorkerDatabaseService", () => {
  let service: WorkerDatabaseService;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: "1" }] }),
      end: jest.fn().mockResolvedValue(undefined),
    };

    service = new WorkerDatabaseService();
    service.pool = mockPool;
  });

  it("executes a query against the pool", async () => {
    const rows = await service.query("SELECT 1", []);
    expect(rows).toEqual([{ id: "1" }]);
    expect(mockPool.query).toHaveBeenCalledWith("SELECT 1", []);
  });

  it("clears user FCM token", async () => {
    await service.clearUserFcmToken("usr-abc");
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE users SET fcm_token = NULL"),
      ["usr-abc"],
    );
  });

  it("cleans up pool onModuleDestroy", async () => {
    await service.onModuleDestroy();
    expect(mockPool.end).toHaveBeenCalled();
  });
});
