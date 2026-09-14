import { env } from "../config/env.js";
import { SESSION_COOKIE } from "../services/neon-auth.services.js";

export function protectSessionOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const allowed = `${env.CORS_ORIGIN},${env.EXTENSION_ORIGINS},${env.APP_URL}`.split(",").map((v) => v.trim());
  const origin = req.headers.origin;
  const cookieAuth = (req.headers.cookie ?? "").includes(`${SESSION_COOKIE}=`) && !req.headers.authorization;
  if ((origin && !allowed.includes(origin)) || (cookieAuth && !origin)) {
    return res.status(403).json({ message: "Untrusted request origin." });
  }
  next();
}
