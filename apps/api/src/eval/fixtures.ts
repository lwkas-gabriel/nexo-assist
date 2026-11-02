import type { TicketDto } from "@nexo/shared/contracts";

/**
 * Chamados que existem no sistema de chamados fictício durante a avaliação. Espelham os de
 * demonstração do tickets-service (Anexo B), sem importá-lo: a api não depende do outro serviço.
 * As datas são relativas ao relógio da avaliação, então os prazos valem em qualquer dia.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type FixtureTicket = Pick<
  TicketDto,
  "number" | "ownerId" | "type" | "category" | "priority" | "status" | "affected" | "title"
> & {
  description: string;
  openedAgoMs: number;
  /** Última resposta da equipe de TI, em tempo atrás; ausente se a TI ainda não respondeu. */
  staffUpdatedAgoMs?: number;
};

const FIXTURE_TICKETS: readonly FixtureTicket[] = [
  {
    // Vencido: prioridade média tem 3 dias úteis e a TI não responde há 6 dias (RN12).
    number: "INC-20311",
    ownerId: "emp-ana-souza",
    type: "incident",
    category: "hardware",
    priority: "medium",
    status: "waiting_analyst",
    affected: "just_me",
    title: "Notebook lento após atualização do Windows",
    description:
      "Lentidão geral desde a atualização do Windows. O diagnóstico da central não resolveu.",
    openedAgoMs: 13 * DAY_MS,
    staffUpdatedAgoMs: 6 * DAY_MS,
  },
  {
    // Dentro do prazo e parecido com um pedido novo de acesso (RN05).
    number: "INC-20298",
    ownerId: "emp-ana-souza",
    type: "incident",
    category: "access",
    priority: "medium",
    status: "in_progress",
    affected: "just_me",
    title: "Acesso à pasta Financeiro no SharePoint",
    description: "Perdi o acesso à pasta Financeiro no SharePoint depois da troca de equipe.",
    openedAgoMs: 15 * DAY_MS,
    staffUpdatedAgoMs: 1 * DAY_MS,
  },
  {
    number: "REQ-10442",
    ownerId: "emp-ana-souza",
    type: "request",
    category: "hardware",
    priority: "low",
    status: "approved",
    affected: "just_me",
    title: "Segundo monitor para home office",
    description:
      "Preciso de um segundo monitor para trabalhar de casa com as planilhas de fechamento.",
    openedAgoMs: 10 * DAY_MS,
    staffUpdatedAgoMs: 2 * DAY_MS,
  },
  {
    // Chamados de outros funcionários: o agent da Ana nunca pode mostrá-los (RN09).
    number: "INC-20480",
    ownerId: "emp-bruno-tavares",
    type: "incident",
    category: "hardware",
    priority: "medium",
    status: "in_progress",
    affected: "my_team",
    title: "Impressora do 3º andar não imprime",
    description: "A impressora do 3º andar aparece como offline para toda a equipe comercial.",
    openedAgoMs: 2 * DAY_MS,
    staffUpdatedAgoMs: 1 * DAY_MS,
  },
  {
    number: "REQ-10460",
    ownerId: "emp-carla-mendes",
    type: "request",
    category: "access",
    priority: "high",
    status: "new",
    affected: "just_me",
    title: "Acesso ao SAP ainda hoje",
    description:
      "Preciso de acesso ao módulo de contas a pagar do SAP ainda hoje para fechar o mês.",
    openedAgoMs: 35 * 60 * 1000,
  },
];

function toTicketDto(fixture: FixtureTicket, now: Date): TicketDto {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const openedAt = ago(fixture.openedAgoMs);
  const lastStaffUpdateAt =
    fixture.staffUpdatedAgoMs === undefined ? null : ago(fixture.staffUpdatedAgoMs);
  return {
    number: fixture.number,
    ownerId: fixture.ownerId,
    type: fixture.type,
    category: fixture.category,
    priority: fixture.priority,
    status: fixture.status,
    affected: fixture.affected,
    title: fixture.title,
    description: fixture.description,
    createdAt: openedAt,
    updatedAt: lastStaffUpdateAt ?? openedAt,
    lastStaffUpdateAt,
    resolvedAt: null,
    updates: [],
  };
}

export function buildEvalTickets(now: Date): TicketDto[] {
  return FIXTURE_TICKETS.map((fixture) => toTicketDto(fixture, now));
}

/** Números dos chamados das fixtures, para os cenários só citarem chamados que existem. */
export const EVAL_TICKET_NUMBERS: readonly string[] = FIXTURE_TICKETS.map(
  (fixture) => fixture.number,
);
