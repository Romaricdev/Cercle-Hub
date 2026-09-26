import { Controller, Get, HttpException, Inject } from "@nestjs/common";

import { HealthService } from "./health.service.js";

@Controller("api/v1/health")
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get("live")
  live(): { status: "ok"; service: "api" } {
    return { status: "ok", service: "api" };
  }

  @Get("ready")
  async ready(): Promise<{ status: "ok" | "degraded"; checks: Record<string, "ok" | "down"> }> {
    const result = await this.health.ready();
    if (result.status !== "ok") {
      throw new HttpException(result, 503);
    }
    return result;
  }
}
