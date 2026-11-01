import type {
  AffectedScope,
  HandoffReason,
  SupportLevel,
  TicketCategory,
  TicketPriority,
  TicketType,
} from "@nexo/shared/domain";

/**
 * O que aconteceu num turno da avaliação, extraído do que o produto grava: as chamadas de tool da
 * resposta, o registro de decisão (o mesmo que a tela mostra), os rascunhos, os chamados e a
 * transferência. O avaliador só lê isto; não conhece banco, agent nem modelo.
 */

/** Quem fez a ação: o agent (chamou a tool) ou o código (ex.: transferência pelo limiar, R39). */
export type ActionOrigin = "agent" | "code";

export type ToolCallObservation = {
  name: string;
  origin: ActionOrigin;
  input: unknown;
  /** Resultado da tool como o agent o recebeu; nulo para ações do código. */
  output: unknown;
};

export type DraftObservation = {
  number: number;
  kind: "create" | "update" | "reopen";
  status: string;
  /** Chamado alvo de um complemento ou reabertura. */
  ticketNumber: string | null;
  /** Só os rascunhos de chamado novo têm estes campos. */
  type?: TicketType;
  priority?: TicketPriority;
  category?: TicketCategory;
  affected?: AffectedScope;
};

export type CreatedTicketObservation = {
  number: string;
  ownerId: string;
  type: TicketType;
  priority: TicketPriority;
};

/** Escrita de conteúdo no sistema de chamados (a transferência do chamado não conta). */
export type ContentWriteObservation = {
  kind: "create" | "update" | "reopen";
  ownerId: string;
};

export type HandoffObservation = {
  reason: HandoffReason;
  supportLevel: SupportLevel;
  byCode: boolean;
};

export type DecisionObservation = {
  /** Rótulo em português da intenção, como o registro de decisão o grava. */
  intentLabel: string;
  classifierConfidence: number;
  /** O classificador respondeu? Sem ele, a intenção e a confiança são só o valor neutro. */
  isClassifierAvailable: boolean;
};

export type TurnObservation = {
  /** Texto de todas as respostas do turno (agent e avisos do sistema). */
  replyText: string;
  /** Só o que o agent escreveu (sem os avisos do sistema, como o da transferência pelo código). */
  agentText: string;
  toolCalls: ToolCallObservation[];
  decision: DecisionObservation | undefined;
  /** Rascunhos criados neste turno. */
  newDrafts: DraftObservation[];
  createdTickets: CreatedTicketObservation[];
  contentWrites: ContentWriteObservation[];
  /** Dono usado em cada consulta ou escrita no sistema de chamados durante o turno. */
  accessedOwners: string[];
  /** Transferência feita neste turno. */
  handoff: HandoffObservation | undefined;
};

/** Por que um turno não rendeu uma decisão para avaliar. */
export type TurnFailure = {
  kind: "quota" | "other";
  detail: string;
};

export type ObservedTurn = {
  message: string;
  observation: TurnObservation;
  failure: TurnFailure | undefined;
};
