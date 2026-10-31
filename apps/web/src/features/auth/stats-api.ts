import { loginStatsSchema, type LoginStats } from "@nexo/shared/contracts";
import { apiRequest } from "../../lib/api-client.ts";

export type { LoginStats };

/** Números da tela de login (A11), validados pelo mesmo contrato que a api usa. */
export async function fetchLoginStats(): Promise<LoginStats> {
  return loginStatsSchema.parse(await apiRequest<unknown>("/stats"));
}

/** "8 s", "72%"; sem dado, um travessão (a tela não inventa número). */
export function formatStat(value: number | null, unit: "s" | "%"): string {
  if (value === null) return "—";
  return unit === "s" ? `${value.toLocaleString("pt-BR")} s` : `${value}%`;
}
