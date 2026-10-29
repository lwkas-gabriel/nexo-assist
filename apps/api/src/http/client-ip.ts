import type { Context } from "hono";

/** Sem proxy na frente (desenvolvimento local), todos compartilham a mesma chave. */
const LOCAL_CLIENT = "local";

/**
 * IP do cliente atrás do proxy do Railway.
 * Usa o último item do X-Forwarded-For: é o que o proxy acrescentou. Os itens anteriores
 * vêm do próprio cliente e podem ser forjados para escapar do limite.
 */
export function clientIp(c: Context): string {
  const forwardedFor = c.req.header("x-forwarded-for");
  const lastHop = forwardedFor?.split(",").at(-1)?.trim();
  return lastHop || LOCAL_CLIENT;
}
