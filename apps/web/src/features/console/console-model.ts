import type { Tone } from "../../ui/status-styles.ts";
import type { ConsoleConversationState } from "./console-api.ts";

/**
 * Textos do console sem React (tela 4): a etiqueta de cada conversa e as horas da lista.
 * O "contato em N min" usa o relógio da tela, recalculado a cada minuto (R36).
 */

const MINUTE_MS = 60_000;

/** "contato em 25 min", "contato em 2 h", ou "contato vencido". */
export function describeContactDue(responseDueAt: string, now: Date): string {
  const minutes = Math.ceil((new Date(responseDueAt).getTime() - now.getTime()) / MINUTE_MS);
  if (minutes <= 0) return "contato vencido";
  if (minutes < 60) return `contato em ${minutes} min`;
  return `contato em ${Math.round(minutes / 60)} h`;
}

/** A etiqueta da conversa e o tom dela (10.2: transferida em danger, pedido de ajuda em warning). */
export function stateTag(
  state: ConsoleConversationState,
  now: Date,
): { label: string; tone: Tone } {
  switch (state.kind) {
    case "waiting":
      if (state.confidence !== null) {
        return {
          label: `Agent pediu ajuda · confiança ${Math.round(state.confidence * 100)}%`,
          tone: "warning",
        };
      }
      return {
        label: state.ticketNumber
          ? `Transferida · ${state.ticketNumber}`
          : `Transferida · ${describeContactDue(state.responseDueAt, now)}`,
        tone: "danger",
      };
    case "analyst":
      return state.byMe
        ? { label: "Você está atendendo", tone: "primary" }
        : { label: `Com ${state.analyst?.name ?? "um analista"}`, tone: "primary" };
    case "agent":
      return { label: "Agent atendendo", tone: "success" };
  }
}

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

/** Hora da lista, como no protótipo: "agora", "10:05" hoje, "ontem" ou "29/10". */
export function listTime(iso: string, now: Date): string {
  const date = new Date(iso);
  if (now.getTime() - date.getTime() < MINUTE_MS) return "agora";
  const day = (value: Date) => dayFormatter.format(value);
  if (day(date) === day(now)) return timeFormatter.format(date);
  const yesterday = new Date(now.getTime() - 24 * 60 * MINUTE_MS);
  if (day(date) === day(yesterday)) return "ontem";
  return day(date);
}

/** Hora de uma mensagem na conversa ("10:05"). */
export function messageTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}
