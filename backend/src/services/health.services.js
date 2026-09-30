import { checkPrisma } from "../db/prisma.js";

export const healthService = {
  liveness() {
    return {
      ok: true,
      service: "backend",
      timestamp: new Date().toISOString(),
    };
  },

  async readiness() {
    const started = Date.now();

    const [db] = await Promise.allSettled([checkPrisma()]);

    const dbOk = db.status === "fulfilled";
    const ok = dbOk;

    return {
      ok,
      service: "backend",
      dependencies: {
        db: dbOk ? { ok: true } : { ok: false, error: "Database or required schema is unavailable." },
      },
      durationMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    };
  },
};
