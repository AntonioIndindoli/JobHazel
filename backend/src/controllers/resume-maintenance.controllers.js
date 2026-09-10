import {
  cleanupAbandonedResumeUploads,
  getResumeMaintenanceStatus,
} from "../services/resume-maintenance.services.js";

export async function cleanupAbandonedResumeUploadsController(_req, res) {
  const result = await cleanupAbandonedResumeUploads();
  return res.status(result.failedCount > 0 ? 503 : 200).json({ cleanup: result });
}

export async function getResumeMaintenanceStatusController(_req, res) {
  const status = await getResumeMaintenanceStatus();
  return res.status(200).json({ status });
}
