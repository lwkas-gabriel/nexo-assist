import { AppError } from "../errors/app-error.ts";
import type { z } from "zod";

/** Valida dados de fora (corpo, query) contra um schema; se inválidos, vira erro 400. */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("INVALID_REQUEST", "Requisição inválida.");
  }
  return result.data;
}

/** Corpo JSON da requisição; JSON malformado vira erro 400, não 500. */
export async function readJson(request: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("INVALID_REQUEST", "Corpo da requisição não é um JSON válido.");
  }
}
