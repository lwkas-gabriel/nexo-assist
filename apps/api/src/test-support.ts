import { randomBytes } from "node:crypto";
import type { Clock } from "@nexo/shared/domain";
import { createApp } from "./app.ts";
import { createContainer, type Container, type ContainerConfig } from "./container.ts";

/**
 * Config de teste: banco em memória, modelo falso e serviço de chamados fictício,
 * com token aleatório a cada execução (nenhum segredo escrito no código).
 */
export function testConfig(overrides: Partial<ContainerConfig> = {}): ContainerConfig {
  return {
    LLM_MODE: "mock",
    DATABASE_URL: ":memory:",
    TICKETS_SERVICE_URL: "http://tickets.invalid",
    TICKETS_SERVICE_TOKEN: randomBytes(32).toString("hex"),
    ...overrides,
  } as ContainerConfig;
}

export function createTestContainer(clock?: Clock): Promise<Container> {
  return createContainer(testConfig(), clock);
}

/** App de teste com um ajudante para fazer login e reaproveitar o cookie de sessão. */
export async function createTestApp(container?: Container) {
  const app = createApp(container ?? (await createTestContainer()), { cookieSecure: false });

  async function login(email: string): Promise<string> {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "qualquer-senha" }),
    });
    if (response.status !== 200) throw new Error(`Login de teste falhou: ${response.status}`);
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Login de teste sem cookie de sessão");
    return cookie;
  }

  return { app, login };
}
