import { describe, expect, it } from "vitest";

import {
    createApplicationFormDefaults,
    createImportReviewDefaults,
    getTodayDateInput,
} from "./constants";

describe("application date defaults", () => {
    const localDate = new Date(2026, 8, 10, 23, 45);

    it("formats today in local time for date inputs", () => {
        expect(getTodayDateInput(localDate)).toBe("2026-09-10");
    });

    it("prefills manual and imported applications with today", () => {
        expect(createApplicationFormDefaults(localDate).dateApplied).toBe("2026-09-10");
        expect(createImportReviewDefaults(localDate).dateApplied).toBe("2026-09-10");
    });
});
