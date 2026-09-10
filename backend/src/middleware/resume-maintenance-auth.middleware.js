import crypto from "node:crypto";

import { env } from "../config/env.js";

function safeEqual(left, right) {
  const leftBytes = Buffer.from(String(left ?? ""));
  const rightBytes = Buffer.from(String(right ?? ""));
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

export function requireResumeMaintenanceAuth(req, res, next) {
  if (!env.RESUME_CLEANUP_SECRET) {
    return res.status(503).json({ message: "Resume maintenance is not configured." });
  }

  const authorization = req.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || !safeEqual(token, env.RESUME_CLEANUP_SECRET)) {
    return res.status(401).json({ message: "Invalid maintenance credentials." });
  }

  return next();
}
