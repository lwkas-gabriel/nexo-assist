import { AppError } from "@nexo/shared/errors";
import type { ConversationMode } from "../db/schema.ts";

/**
 * Máquina de estados da conversa (11.3). Uma tabela só, para a regra não se espalhar:
 * - agent → waiting_analyst: transferência (RN07);
 * - waiting_analyst → analyst: um analista assume;
 * - analyst ou waiting_analyst → agent: o analista devolve ao agent;
 * - qualquer estado aberto → closed: atendimento encerrado.
 */
export const CONVERSATION_EVENTS = ["handoff", "assume", "release", "close"] as const;
export type ConversationEvent = (typeof CONVERSATION_EVENTS)[number];

const TRANSITIONS: Record<ConversationEvent, { from: ConversationMode[]; to: ConversationMode }> = {
  handoff: { from: ["agent"], to: "waiting_analyst" },
  assume: { from: ["waiting_analyst"], to: "analyst" },
  release: { from: ["waiting_analyst", "analyst"], to: "agent" },
  close: { from: ["agent", "waiting_analyst", "analyst"], to: "closed" },
};

/** Estado de destino do evento, ou erro tipado se a transição não existe a partir de `mode`. */
export function nextMode(mode: ConversationMode, event: ConversationEvent): ConversationMode {
  const transition = TRANSITIONS[event];
  if (!transition.from.includes(mode)) {
    throw new AppError("CONFLICT", `A conversa não pode ir de "${mode}" com "${event}".`);
  }
  return transition.to;
}

/** RN08: o agent só responde quando a conversa está com ele. */
export function agentMayReply(mode: ConversationMode): boolean {
  return mode === "agent";
}
