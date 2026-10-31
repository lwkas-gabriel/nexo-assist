import { describe, expect, it } from "vitest";
import { SESSION_INACTIVITY_MS, isSessionExpired } from "./session-state.ts";

const start = new Date("2026-10-27T12:00:00Z");
const after = (ms: number) => new Date(start.getTime() + ms);
const session = { agentMessages: 3, lastActivityAt: start };
const withAgent = { mode: "agent" as const, updatedAt: start };

describe("regra da sessão (A05, R41)", () => {
  it("A05: expira só depois de mais de 8 h sem atividade", () => {
    expect(isSessionExpired(session, withAgent, after(SESSION_INACTIVITY_MS))).toBe(false);
    expect(isSessionExpired(session, withAgent, after(SESSION_INACTIVITY_MS + 60_000))).toBe(true);
  });

  it("R41: com a conversa com um analista, não expira", () => {
    const later = after(SESSION_INACTIVITY_MS * 2);
    expect(isSessionExpired(session, { mode: "waiting_analyst", updatedAt: start }, later)).toBe(
      false,
    );
    expect(isSessionExpired(session, { mode: "analyst", updatedAt: start }, later)).toBe(false);
  });

  it("R18: atividade de qualquer autor na conversa (analista, devolução) mantém a sessão viva", () => {
    const releasedLater = { mode: "agent" as const, updatedAt: after(SESSION_INACTIVITY_MS) };

    expect(isSessionExpired(session, releasedLater, after(SESSION_INACTIVITY_MS + 60_000))).toBe(
      false,
    );
  });

  it("R03: sessão vazia não expira (não troca o resumo da anterior por um vazio)", () => {
    const empty = { agentMessages: 0, lastActivityAt: start };

    expect(isSessionExpired(empty, withAgent, after(SESSION_INACTIVITY_MS * 3))).toBe(false);
  });
});
