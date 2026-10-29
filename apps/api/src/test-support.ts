import { randomBytes } from "node:crypto";
import { createContainer, type ContainerConfig } from "./container.ts";

/** Config de teste: modelo falso e serviço de chamados fictício, com token aleatório a cada execução. */
export function testConfig(): ContainerConfig {
  return {
    LLM_MODE: "mock",
    TICKETS_SERVICE_URL: "http://tickets.invalid",
    TICKETS_SERVICE_TOKEN: randomBytes(32).toString("hex"),
  };
}

export function createTestContainer() {
  return createContainer(testConfig());
}
