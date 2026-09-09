import { Router } from "express";

import {
  completeResumeUploadController,
  createResumeDownloadUrlController,
  initiateResumeUploadController,
  listResumesController,
  updateResumeController,
} from "../controllers/resumes.controllers.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import {
  resumePatchSchema,
  validateResumeUploadPayload,
  validateResumeListQuery,
} from "../validators/resume.validators.js";

const router = Router();

router.use(requireAuth);
router.get("/", validateResumeListQuery, listResumesController);
router.post("/uploads", validateResumeUploadPayload, initiateResumeUploadController);
router.post("/:id/complete", completeResumeUploadController);
router.get("/:id/download-url", createResumeDownloadUrlController);
router.patch("/:id", validateBody(resumePatchSchema), updateResumeController);

export default router;
