import { rateLimitAuth } from "../middleware/auth-rate-limit.middleware.js";
import { requireResumeMaintenanceAuth } from "../middleware/resume-maintenance-auth.middleware.js";
import { cleanupAuthTokens } from "../services/auth-maintenance.services.js";
import { Router } from "express";
import {
  changePasswordController,
  deleteAccountController,
  exportAccountController,
  loginController,
  extensionLoginController,
  extensionLogoutController,
  extensionRefreshController,
  forgotPasswordController,
  logoutController,
  meController,
  refreshController,
  resendVerificationController,
  resetPasswordController,
  signupController,
  updateProfileController,
  verifyEmailController,
} from "../controllers/auth.controllers.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import {
  deleteAccountSchema,
  extensionRefreshSchema,
  emailSchema,
  loginSchema,
  passwordChangeSchema,
  profileSchema,
  signupSchema,
  emailOtpSchema,
  otpPasswordResetSchema,
} from "../validators/auth.validators.js";

const router = Router();

router.get("/maintenance/cleanup", requireResumeMaintenanceAuth, async (_req, res) => {
  return res.status(200).json({ cleanup: await cleanupAuthTokens() });
});

router.post("/signup", rateLimitAuth("signup"), validateBody(signupSchema), signupController);
router.post("/login", rateLimitAuth("login"), validateBody(loginSchema), loginController);
router.post("/verify-email", rateLimitAuth("verify-email"), validateBody(emailOtpSchema), verifyEmailController);
router.post("/resend-verification", rateLimitAuth("resend-verification"), validateBody(emailSchema), resendVerificationController);
router.post("/forgot-password", rateLimitAuth("forgot-password"), validateBody(emailSchema), forgotPasswordController);
router.post("/reset-password", rateLimitAuth("reset-password"), validateBody(otpPasswordResetSchema), resetPasswordController);
router.post("/extension/login", rateLimitAuth("login"), validateBody(loginSchema), extensionLoginController);
router.post("/extension/refresh", validateBody(extensionRefreshSchema), extensionRefreshController);
router.post("/extension/logout", validateBody(extensionRefreshSchema), extensionLogoutController);
router.post("/refresh", refreshController);
router.post("/logout", logoutController);
router.get("/me", requireAuth, meController);
router.patch("/profile", requireAuth, validateBody(profileSchema), updateProfileController);
router.patch("/password", requireAuth, validateBody(passwordChangeSchema), changePasswordController);
router.get("/export", requireAuth, exportAccountController);
router.delete("/account", requireAuth, validateBody(deleteAccountSchema), deleteAccountController);

export default router;
