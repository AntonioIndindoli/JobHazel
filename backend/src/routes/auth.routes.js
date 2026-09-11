import { Router } from "express";
import {
  changePasswordController,
  deleteAccountController,
  exportAccountController,
  loginController,
  extensionLoginController,
  extensionLogoutController,
  extensionRefreshController,
  logoutController,
  meController,
  refreshController,
  signupController,
  updateProfileController,
} from "../controllers/auth.controllers.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import {
  deleteAccountSchema,
  extensionRefreshSchema,
  loginSchema,
  passwordChangeSchema,
  profileSchema,
  signupSchema,
} from "../validators/auth.validators.js";

const router = Router();

router.post("/signup", validateBody(signupSchema), signupController);
router.post("/login", validateBody(loginSchema), loginController);
router.post("/extension/login", validateBody(loginSchema), extensionLoginController);
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
