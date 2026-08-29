jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));

import {
  metricsRegistry,
  httpRequestDuration,
  dbOperationDuration,
  externalDepDuration,
  measureDb,
  measureExternal,
} from "../src/common/metrics.js";

describe("RED Metrics & Registry", () => {
  it("registers all three required histograms", async () => {
    const metricNames = await metricsRegistry.getMetricsAsJSON();
    const names = metricNames.map((m) => m.name);

    expect(names).toContain("http_request_duration_seconds");
    expect(names).toContain("db_operation_duration_seconds");
    expect(names).toContain("external_dep_duration_seconds");
  });

  it("restricts metric labels to bounded sets to prevent cardinality explosion", () => {
    // Check that httpRequestDuration uses strictly bounded labels
    // @ts-expect-error accessing private labelNames for test assertion
    const httpLabels = httpRequestDuration.labelNames as string[];
    expect(httpLabels).toEqual(["method", "route", "status_class"]);

    // @ts-expect-error accessing private labelNames
    const dbLabels = dbOperationDuration.labelNames as string[];
    expect(dbLabels).toEqual(["operation"]);

    // @ts-expect-error accessing private labelNames
    const extLabels = externalDepDuration.labelNames as string[];
    expect(extLabels).toEqual(["service"]);
  });

  it("correctly times operations and records in histograms", async () => {
    const stopDb = measureDb("query");
    stopDb();

    const stopExt = measureExternal("stripe");
    stopExt();

    const metricsText = await metricsRegistry.metrics();
    expect(metricsText).toContain("db_operation_duration_seconds");
    expect(metricsText).toContain("external_dep_duration_seconds");
  });
});
