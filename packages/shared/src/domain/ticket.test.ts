import { describe, expect, it } from "vitest";
import {
  CLOSED_TICKET_STATUSES,
  OPEN_TICKET_STATUSES,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  formatTicketNumber,
  isOpenStatus,
  parseTicketNumber,
  ticketTypeFromNumber,
} from "./ticket.ts";

describe("categorias", () => {
  it("RN02: são exatamente as seis do Anexo A", () => {
    const labels = TICKET_CATEGORIES.map((category) => TICKET_CATEGORY_LABELS[category]);

    expect(labels).toEqual(["Acesso", "Rede e VPN", "Hardware", "Software", "E-mail", "Outros"]);
  });
});

describe("status", () => {
  it("A12: aguardando analista, aprovado e em atendimento contam como abertos", () => {
    expect(isOpenStatus("waiting_analyst")).toBe(true);
    expect(isOpenStatus("approved")).toBe(true);
    expect(isOpenStatus("in_service")).toBe(true);
    expect(isOpenStatus("reopened")).toBe(true);
  });

  it("A12: resolvido e cancelado contam como fechados", () => {
    expect(isOpenStatus("resolved")).toBe(false);
    expect(isOpenStatus("cancelled")).toBe(false);
  });

  it("todo status é aberto ou fechado, nunca os dois", () => {
    const overlap = OPEN_TICKET_STATUSES.filter((status) =>
      (CLOSED_TICKET_STATUSES as readonly string[]).includes(status),
    );

    expect(overlap).toEqual([]);
  });
});

describe("número do chamado", () => {
  it("RN01: incidente usa INC e requisição usa REQ, com 5 dígitos", () => {
    expect(formatTicketNumber("incident", 20311)).toBe("INC-20311");
    expect(formatTicketNumber("request", 442)).toBe("REQ-00442");
  });

  it("entende o número escrito de jeitos diferentes pelo funcionário", () => {
    expect(parseTicketNumber("INC-20311")).toBe("INC-20311");
    expect(parseTicketNumber(" inc 20311 ")).toBe("INC-20311");
    expect(parseTicketNumber("req_10442")).toBe("REQ-10442");
  });

  it("recusa o que não é número de chamado", () => {
    expect(parseTicketNumber("INC-123")).toBeUndefined();
    expect(parseTicketNumber("PRB-20311")).toBeUndefined();
    expect(parseTicketNumber("meu chamado")).toBeUndefined();
  });

  it("descobre o tipo pelo prefixo", () => {
    expect(ticketTypeFromNumber("INC-20311")).toBe("incident");
    expect(ticketTypeFromNumber("REQ-10442")).toBe("request");
    expect(ticketTypeFromNumber("XYZ-1")).toBeUndefined();
  });
});
