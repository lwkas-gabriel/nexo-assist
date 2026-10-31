import { apiRequest } from "../../lib/api-client.ts";

/** Números da tela de login (A11), calculados pela api. Nulo quando ainda não há dados. */
export type LoginStats = {
  firstResponseSeconds: number | null;
  resolvedWithoutQueuePercent: number | null;
  analystsOnline: number;
};

export function fetchLoginStats(): Promise<LoginStats> {
  return apiRequest<LoginStats>("/stats");
}

/** "8 s", "72%"; sem dado, um travessão (a tela não inventa número). */
export function formatStat(value: number | null, unit: "s" | "%"): string {
  if (value === null) return "—";
  return unit === "s" ? `${value.toLocaleString("pt-BR")} s` : `${value}%`;
}
