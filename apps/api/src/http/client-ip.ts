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
  return lastHop ? limitKeyForIp(lastHop) : LOCAL_CLIENT;
}

const IPV6_GROUPS = 8;
const IPV6_NETWORK_GROUPS = 4;

/**
 * Chave dos limites por IP. Um IPv6 vira a rede /64 dele: cada cliente costuma ter uma rede /64
 * inteira e poderia trocar de endereço dentro dela a cada mensagem para escapar do limite.
 * IPv4 (inclusive o mapeado em IPv6, ::ffff:1.2.3.4) fica como está.
 */
export function limitKeyForIp(ip: string): string {
  if (!ip.includes(":") || ip.includes(".")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = ip.includes("::") && tail ? tail.split(":") : [];
  const missing = ip.includes("::") ? IPV6_GROUPS - headGroups.length - tailGroups.length : 0;
  const groups = [...headGroups, ...Array<string>(Math.max(0, missing)).fill("0"), ...tailGroups];
  const network = groups
    .slice(0, IPV6_NETWORK_GROUPS)
    .map((group) => group.replace(/^0+(?=.)/, ""));
  return `${network.join(":")}::/64`;
}
