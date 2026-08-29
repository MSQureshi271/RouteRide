/**
 * Metrics controller — GET /metrics (Prometheus text format)
 *
 * Intended for internal scraping only (sidecar, VPC, etc.).
 * In production this route should be protected at the network layer or
 * placed on a separate internal port.
 */
import { Controller, Get, Header, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { metricsRegistry } from "../common/metrics.js";

@Controller("metrics")
export class MetricsController {
  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async getMetrics(@Res() reply: FastifyReply): Promise<void> {
    const output = await metricsRegistry.metrics();
    void reply.send(output);
  }
}
