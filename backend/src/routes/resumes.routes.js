import { Router } from "express";

import {
  completeResumeUploadController,
  createResumeDownloadUrlController,
  deleteResumeController,
  initiateResumeUploadController,
  listResumesController,
  updateResumeController,
} from "../controllers/resumes.controllers.js";
import {
  cleanupAbandonedResumeUploadsController,
  getResumeMaintenanceStatusController,
} from "../controllers/resume-maintenance.controllers.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireResumeMaintenanceAuth } from "../middleware/resume-maintenance-auth.middleware.js";
import { rateLimitResumeEndpoint } from "../middleware/resume-rate-limit.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import {
  resumePatchSchema,
  validateResumeUploadPayload,
  validateResumeListQuery,
} from "../validators/resume.validators.js";

const router = Router();

router.get(
  "/maintenance/status",
  requireResumeMaintenanceAuth,
  getResumeMaintenanceStatusController,
);
router.get(
  "/maintenance/cleanup",
  requireResumeMaintenanceAuth,
  cleanupAbandonedResumeUploadsController,
);
router.post(
  "/maintenance/cleanup",
  requireResumeMaintenanceAuth,
  cleanupAbandonedResumeUploadsController,
);

router.use(requireAuth);
router.get("/", validateResumeListQuery, listResumesController);
router.post(
  "/uploads",
  rateLimitResumeEndpoint("upload-initiation", env.RESUME_UPLOAD_INIT_RATE_LIMIT),
  validateResumeUploadPayload,
  initiateResumeUploadController,
);
router.post(
  "/:id/complete",
  rateLimitResumeEndpoint("upload-completion", env.RESUME_UPLOAD_COMPLETE_RATE_LIMIT),
  completeResumeUploadController,
);
router.get(
  "/:id/download-url",
  rateLimitResumeEndpoint("download-url", env.RESUME_DOWNLOAD_RATE_LIMIT),
  createResumeDownloadUrlController,
);
router.patch("/:id", validateBody(resumePatchSchema), updateResumeController);
router.delete("/:id", deleteResumeController);

export default router;
