import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip.ts";

const app = new Hono().get("/", (c) => c.text(clientIp(c)));

async function ipFor(headers: Record<string, string>) {
  return (await app.request("/", { headers })).text();
}

describe("clientIp", () => {
  it("usa o IP acrescentado pelo proxy, não o que o cliente enviou", async () => {
    expect(await ipFor({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" })).toBe("203.0.113.7");
  });

  it("sem proxy, usa uma chave local única", async () => {
    expect(await ipFor({})).toBe("local");
  });
});
