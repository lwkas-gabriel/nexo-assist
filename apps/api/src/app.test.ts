import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createContainer } from "./container.ts";

describe("api", () => {
  it("responde ao health check em /api/health", async () => {
    const app = createApp(createContainer({ LLM_MODE: "mock" }));

    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
