import { healthService } from "../services/health.services.js";

export async function getLiveness(req, res) {
  const result = healthService.liveness();
  res.status(200).json(result);
}

export async function getReadiness(req, res) {
  res.set("Cache-Control", "no-store");
  const result = await healthService.readiness();
  res.status(result.ok ? 200 : 503).json(result);
}
