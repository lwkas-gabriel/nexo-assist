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

/** Como `readJson`, para rotas em que o corpo é opcional: sem corpo, vale `{}`. */
export async function readOptionalJson(request: { text(): Promise<string> }): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("INVALID_REQUEST", "Corpo da requisição não é um JSON válido.");
  }
}
