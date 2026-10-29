import { describe, expect, it } from "vitest";
import { findDuplicateCandidates, type DuplicateCheckTicket } from "./duplicates.ts";

const now = new Date("2026-10-29T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

type TestTicket = DuplicateCheckTicket & { number: string };

const vpnOpen: TestTicket = {
  number: "INC-20400",
  status: "in_progress",
  category: "network_vpn",
  title: "VPN cai toda hora",
  description: "A VPN desconecta várias vezes por dia.",
};
const monitorRequest: TestTicket = {
  number: "REQ-10442",
  status: "approved",
  category: "hardware",
  title: "Segundo monitor para home office",
  description: "Preciso de um segundo monitor.",
};
const sapResolvedRecently: TestTicket = {
  number: "INC-20150",
  status: "resolved",
  resolvedAt: daysAgo(4),
  category: "access",
  title: "Senha do SAP bloqueada",
  description: "Não consigo entrar no SAP, senha bloqueada.",
};
const sapResolvedLongAgo: TestTicket = {
  ...sapResolvedRecently,
  number: "INC-19000",
  resolvedAt: daysAgo(30),
};

const numbers = (candidates: { ticket: TestTicket }[]) => candidates.map((c) => c.ticket.number);

describe("findDuplicateCandidates", () => {
  it("RN05: aponta o chamado aberto sobre o mesmo assunto, para ser atualizado", () => {
    const candidates = findDuplicateCandidates(
      [vpnOpen, monitorRequest],
      { description: "minha VPN não conecta, erro 809", category: "network_vpn" },
      now,
    );

    expect(candidates).toEqual([expect.objectContaining({ ticket: vpnOpen, action: "update" })]);
  });

  it("RN06: aponta o chamado resolvido há até 7 dias, para ser reaberto", () => {
    const candidates = findDuplicateCandidates(
      [sapResolvedRecently],
      { description: "a senha do SAP bloqueou de novo", category: "access" },
      now,
    );

    expect(candidates).toEqual([
      expect.objectContaining({ ticket: sapResolvedRecently, action: "reopen" }),
    ]);
  });

  it("RN06: ignora chamado resolvido há mais de 7 dias (vira chamado novo)", () => {
    const candidates = findDuplicateCandidates(
      [sapResolvedLongAgo],
      { description: "a senha do SAP bloqueou de novo", category: "access" },
      now,
    );

    expect(candidates).toEqual([]);
  });

  it("não aponta chamado de mesma categoria mas de outro assunto", () => {
    const candidates = findDuplicateCandidates(
      [monitorRequest],
      { description: "notebook lento depois da atualização", category: "hardware" },
      now,
    );

    expect(candidates).toEqual([]);
  });

  it("encontra mesmo sem a categoria, quando o texto é bem parecido", () => {
    const candidates = findDuplicateCandidates(
      [vpnOpen],
      { description: "VPN cai toda hora" },
      now,
    );

    expect(numbers(candidates)).toEqual(["INC-20400"]);
  });

  it("ordena do mais ao menos parecido", () => {
    const vpnSlow: TestTicket = {
      ...vpnOpen,
      number: "INC-20401",
      title: "Internet lenta",
      description: "VPN lenta às vezes.",
    };

    const candidates = findDuplicateCandidates(
      [vpnSlow, vpnOpen],
      { description: "VPN cai toda hora, desconecta", category: "network_vpn" },
      now,
    );

    expect(numbers(candidates)).toEqual(["INC-20400", "INC-20401"]);
  });
});
