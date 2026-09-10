import { env } from "../config/env.js";
import { consumeResumeRateLimit } from "../services/resume-rate-limit.services.js";

export function rateLimitResumeEndpoint(endpoint, limit) {
  return async (req, res, next) => {
    try {
      const result = await consumeResumeRateLimit(req.auth.sub, endpoint, {
        limit,
        windowSeconds: env.RESUME_RATE_LIMIT_WINDOW_SECONDS,
      });
      const resetSeconds = Math.max(
        1,
        Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
      );
      res.setHeader("RateLimit-Limit", String(result.limit));
      res.setHeader("RateLimit-Remaining", String(result.remaining));
      res.setHeader("RateLimit-Reset", String(resetSeconds));

      if (!result.allowed) {
        res.setHeader("Retry-After", String(resetSeconds));
        return res.status(429).json({
          code: "RESUME_RATE_LIMITED",
          message: "Too many resume requests. Try again after the rate-limit window resets.",
        });
      }

      return next();
    } catch {
      const error = new Error("Resume request limits are temporarily unavailable.");
      error.status = 503;
      error.code = "RESUME_RATE_LIMIT_UNAVAILABLE";
      return next(error);
    }
  };
}
