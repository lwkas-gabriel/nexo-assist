import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { clientIp, limitKeyForIp } from "./client-ip.ts";

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

describe("limitKeyForIp", () => {
  it("IPv6 vira a rede /64: trocar de endereço dentro dela não escapa do limite", () => {
    expect(limitKeyForIp("2001:db8:abcd:12::1")).toBe("2001:db8:abcd:12::/64");
    expect(limitKeyForIp("2001:0db8:abcd:0012:ffff:1:2:3")).toBe("2001:db8:abcd:12::/64");
    expect(limitKeyForIp("2001:db8::7")).toBe("2001:db8:0:0::/64");
  });

  it("IPv4, inclusive mapeado em IPv6, fica como está", () => {
    expect(limitKeyForIp("203.0.113.7")).toBe("203.0.113.7");
    expect(limitKeyForIp("::ffff:203.0.113.7")).toBe("::ffff:203.0.113.7");
  });
});
