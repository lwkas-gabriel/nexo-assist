import { describe, expect, it } from "vitest";
import { z } from "zod";
import { InvalidEnvError, parseEnv } from "./parse-env";

const schema = z.object({
  PORT: z.coerce.number().int().positive(),
  API_KEY: z.string().min(10),
});

describe("parseEnv", () => {
  it("devolve os valores convertidos quando o ambiente é válido", () => {
    const env = parseEnv(schema, { PORT: "3000", API_KEY: "chave-de-teste-123" });

    expect(env).toEqual({ PORT: 3000, API_KEY: "chave-de-teste-123" });
  });

  it("lista todas as variáveis ausentes de uma vez", () => {
    expect(() => parseEnv(schema, {})).toThrowError(/PORT[\s\S]*API_KEY/);
  });

  it("lança InvalidEnvError para a aplicação falhar ao iniciar", () => {
    expect(() => parseEnv(schema, {})).toThrowError(InvalidEnvError);
  });

  it("nunca inclui o valor recebido na mensagem de erro (evita vazar segredos em logs)", () => {
    const secret = "segredo";

    try {
      parseEnv(schema, { PORT: "3000", API_KEY: secret });
      expect.unreachable("deveria ter lançado erro");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvError);
      expect((error as Error).message).toContain("API_KEY");
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
