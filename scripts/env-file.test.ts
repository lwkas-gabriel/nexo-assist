import { describe, expect, it } from "vitest";
import { mergeEnvFile, readEnvValues } from "./env-file.ts";

const example = "# Porta\nPORT=3001\n# Segredo\nSERVICE_TOKEN=\n";

describe("mergeEnvFile", () => {
  it("cria o .env a partir do exemplo, preenchendo os segredos", () => {
    const result = mergeEnvFile(example, undefined, { SERVICE_TOKEN: "gerado" });

    expect(result.content).toBe("# Porta\nPORT=3001\n# Segredo\nSERVICE_TOKEN=gerado\n");
  });

  it("mantém o que o usuário já configurou e acrescenta só as variáveis novas", () => {
    const current = "PORT=4000\n";

    const result = mergeEnvFile(example, current, { SERVICE_TOKEN: "gerado" });

    expect(result.content).toBe("PORT=4000\nSERVICE_TOKEN=gerado\n");
    expect(result.addedKeys).toEqual(["SERVICE_TOKEN"]);
  });

  it("não troca um segredo que já existe", () => {
    const current = "PORT=3001\nSERVICE_TOKEN=do-usuario\n";

    const result = mergeEnvFile(example, current, { SERVICE_TOKEN: "gerado" });

    expect(result.content).toBe(current);
    expect(result.filledSecrets).toEqual([]);
  });
});

describe("readEnvValues", () => {
  it("lê só os valores definidos", () => {
    expect(readEnvValues("A=1\nB=\n# C=3")).toEqual(new Map([["A", "1"]]));
  });
});
