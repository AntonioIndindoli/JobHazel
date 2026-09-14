import express from "express";
import cors from "cors";
import { protectSessionOrigin } from "./middleware/session-origin.middleware.js";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import applicationRoutes from "./routes/applications.routes.js";
import interviewRoutes from "./routes/interviews.routes.js";
import taskRoutes from "./routes/tasks.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";
import contactRoutes from "./routes/contacts.routes.js";
import importRoutes from "./routes/imports.routes.js";
import parserRoutes from "./routes/parser.routes.js";
import resumeRoutes from "./routes/resumes.routes.js";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";

export function createApp() {
  const app = express();
  // Only trust explicitly configured proxy addresses/subnets, never arbitrary X-Forwarded-For.
  if (process.env.TRUST_PROXY) {
    app.set("trust proxy", process.env.TRUST_PROXY.split(",").map((value) => value.trim()));
  }
  const corsOrigins = `${env.CORS_ORIGIN},${env.EXTENSION_ORIGINS}`.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json());
  app.use(protectSessionOrigin);

  app.use("/health", healthRoutes);
  app.use("/auth", authRoutes);
  app.use("/applications", applicationRoutes);
  app.use("/interviews", interviewRoutes);
  app.use("/tasks", taskRoutes);
  app.use("/notifications", notificationRoutes);
  app.use("/contacts", contactRoutes);
  app.use("/imports", importRoutes);
  app.use("/parser", parserRoutes);
  app.use("/resumes", resumeRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// Vercel detects and deploys this default export as a single Express Function.
// Keeping createApp exported separately preserves the test and local-dev factory.
const app = createApp();

export default app;
