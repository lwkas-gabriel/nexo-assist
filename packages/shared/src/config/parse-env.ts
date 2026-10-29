import type { z } from "zod";

export class InvalidEnvError extends Error {
  override name = "InvalidEnvError";
}

/**
 * Valida as variáveis de ambiente contra um schema e devolve o resultado tipado.
 *
 * É o único caminho permitido para ler `process.env` (ver CLAUDE.md): sem valores
 * padrão para segredos no código, a aplicação não sobe se faltar algo.
 * A mensagem de erro cita só o nome da variável, nunca o valor, para não vazar segredos em logs.
 */
export function parseEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: Record<string, string | undefined>,
): z.infer<Schema> {
  const result = schema.safeParse(source);
  if (result.success) {
    return result.data;
  }

  const problems = result.error.issues
    .map((issue) => `- ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
    .join("\n");
  throw new InvalidEnvError(`Variáveis de ambiente inválidas ou ausentes:\n${problems}`);
}
