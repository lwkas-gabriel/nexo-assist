import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

describe("api", () => {
  it("responde ao health check em /api/health", async () => {
    const response = await createApp().request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
