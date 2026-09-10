import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  validateApplicationPayload,
  validateApplicationResumeAssociation,
  validateStatusTransition,
} from "../validators/application.validators.js";
import {
  createApplicationController,
  deleteApplicationController,
  deleteApplicationHistoryEventController,
  getApplicationController,
  getApplicationHistoryController,
  listApplicationHistoriesController,
  listApplicationsController,
  setApplicationResumeController,
  transitionApplicationStatusController,
  updateApplicationController,
} from "../controllers/applications.controllers.js";

const router = Router();

router.use(requireAuth);
router.get("/", listApplicationsController);
router.post("/", validateApplicationPayload, createApplicationController);
router.get("/history", listApplicationHistoriesController);
router.get("/:id", getApplicationController);
router.get("/:id/history", getApplicationHistoryController);
router.delete("/:id/history/:activityLogId", deleteApplicationHistoryEventController);
router.put("/:id", validateApplicationPayload, updateApplicationController);
router.put("/:id/resume", validateApplicationResumeAssociation, setApplicationResumeController);
router.patch("/:id/status", validateStatusTransition, transitionApplicationStatusController);
router.delete("/:id", deleteApplicationController);

export default router;
