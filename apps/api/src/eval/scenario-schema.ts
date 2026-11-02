import { DEMO_USERS } from "@nexo/shared/demo";
import {
  AFFECTED_SCOPES,
  HANDOFF_REASONS,
  SUPPORT_LEVELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_TYPES,
  parseTicketNumber,
} from "@nexo/shared/domain";
import { z } from "zod";
import { INTENTS } from "../agent/classifier.ts";
import {
  ASK_WITH_OPTIONS_TOOL_ID,
  CONFIRM_DRAFT_TOOL_ID,
  PROPOSE_TICKET_DRAFT_TOOL_ID,
  PROPOSE_TICKET_UPDATE_TOOL_ID,
} from "../agent/tools/draft-tools.ts";
import { HANDOFF_TO_ANALYST_TOOL_ID } from "../agent/tools/handoff-tool.ts";
import { SEARCH_KNOWLEDGE_BASE_TOOL_ID } from "../agent/tools/search-knowledge-base.ts";
import { GET_TICKET_TOOL_ID, LIST_MY_TICKETS_TOOL_ID } from "../agent/tools/ticket-tools.ts";

/**
 * Cenários da avaliação do agent (T27) como dados: o que o funcionário diz e qual AÇÃO se espera
 * do agent, nunca a prosa da resposta. Os cenários não conhecem o executor nem o avaliador.
 */

/** Todas as tools do agent; um teste confere que a lista bate com a do agent de verdade. */
export const AGENT_TOOL_IDS = [
  SEARCH_KNOWLEDGE_BASE_TOOL_ID,
  LIST_MY_TICKETS_TOOL_ID,
  GET_TICKET_TOOL_ID,
  PROPOSE_TICKET_DRAFT_TOOL_ID,
  PROPOSE_TICKET_UPDATE_TOOL_ID,
  CONFIRM_DRAFT_TOOL_ID,
  ASK_WITH_OPTIONS_TOOL_ID,
  HANDOFF_TO_ANALYST_TOOL_ID,
] as const;

/** Categorias do critério "qualidade das decisões", com o nome que o relatório mostra. */
export const EVAL_CATEGORY_LABELS = {
  knowledge: "dúvida respondida pela central de ajuda",
  out_of_scope: "fora de escopo",
  vague_request: "pedido vago (exige pergunta)",
  open_incident: "abrir incidente",
  open_request: "abrir requisição",
  duplicate: "duplicidade",
  overdue: "chamado com prazo vencido",
  critical: "incidente crítico",
  ticket_status: "consulta de status sem o número",
  analyst_request: "pedido de analista",
  draft_confirmation: "confirmação de rascunho",
  privacy: "privacidade e prompt injection",
} as const;
export type EvalCategory = keyof typeof EVAL_CATEGORY_LABELS;
export const EVAL_CATEGORIES = Object.keys(EVAL_CATEGORY_LABELS) as [
  EvalCategory,
  ...EvalCategory[],
];

const toolIdSchema = z.enum(AGENT_TOOL_IDS);
const toolListSchema = z.array(toolIdSchema).min(1);

const ticketNumberSchema = z.string().refine((value) => parseTicketNumber(value) === value, {
  message: "número de chamado no formato INC-12345 ou REQ-12345",
});

/** Expressão regular escrita como texto, conferida na leitura do cenário (sem ela, o erro só viria na execução). */
const regexSourceSchema = z.string().refine(
  (source) => {
    try {
      new RegExp(source, "iu");
      return true;
    } catch {
      return false;
    }
  },
  { message: "expressão regular inválida" },
);

const toolsExpectationSchema = z
  .strictObject({
    /** Todas estas tools foram chamadas no turno. */
    mustCall: toolListSchema.optional(),
    /** Pelo menos uma destas foi chamada (o modelo pode escolher entre caminhos equivalentes). */
    mustCallOneOf: toolListSchema.optional(),
    /** Nenhuma destas foi chamada. */
    mustNotCall: toolListSchema.optional(),
    /** Nenhuma tool foi chamada. */
    none: z.literal(true).optional(),
  })
  .refine((tools) => Object.keys(tools).length > 0, { message: "expectativa de tools vazia" })
  .refine((tools) => !tools.none || Object.keys(tools).length === 1, {
    message: "'none' não combina com as outras",
  });

const draftExpectationSchema = z
  .strictObject({
    kind: z.enum(["create", "update", "reopen"]).optional(),
    type: z.enum(TICKET_TYPES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    affected: z.enum(AFFECTED_SCOPES).optional(),
    /** Chamado alvo de um complemento ou reabertura. */
    ticketNumber: ticketNumberSchema.optional(),
  })
  .refine((draft) => Object.keys(draft).length > 0, { message: "expectativa de rascunho vazia" });

const handoffExpectationSchema = z
  .strictObject({
    reason: z.enum(HANDOFF_REASONS).optional(),
    supportLevel: z.enum(SUPPORT_LEVELS).optional(),
    /** A transferência foi feita pelo código (limiar de confiança, R39), sem o agent chamar a tool. */
    byCode: z.boolean().optional(),
  })
  .refine((handoff) => Object.keys(handoff).length > 0, {
    message: "expectativa de transferência vazia",
  });

/**
 * O que se espera de UM turno (uma mensagem do funcionário). Cada campo é opcional e só vale o
 * que o cenário declara; os invariantes de privacidade e de confirmação valem sempre.
 */
export const turnExpectationSchema = z
  .strictObject({
    tools: toolsExpectationSchema.optional(),
    /** O que o classificador entendeu (etapa 1), pelo código da intenção. */
    intent: z.enum(INTENTS).optional(),
    /** Confiança do classificador abaixo (true) ou não abaixo (false) do limiar do R39. */
    isLowConfidence: z.boolean().optional(),
    /** Fez uma pergunta: usou ask_with_options ou a resposta tem "?". */
    asksQuestion: z.boolean().optional(),
    /** "none": nenhum rascunho novo no turno. Objeto: um rascunho pendente novo com estes campos. */
    draft: z.union([z.literal("none"), draftExpectationSchema]).optional(),
    /** Quantos chamados foram criados no turno. */
    ticketsCreated: z.int().min(0).optional(),
    /** Todo chamado criado no turno tem este tipo e/ou esta prioridade. */
    createdTicket: z
      .strictObject({
        type: z.enum(TICKET_TYPES).optional(),
        priority: z.enum(TICKET_PRIORITIES).optional(),
      })
      .refine((ticket) => Object.keys(ticket).length > 0, { message: "expectativa vazia" })
      .optional(),
    /** "none": não houve transferência no turno. Objeto: houve, com estes dados. */
    handoff: z.union([z.literal("none"), handoffExpectationSchema]).optional(),
    /** RN05: o agent apontou o chamado aberto parecido em vez de criar outro. */
    duplicateOf: ticketNumberSchema.optional(),
    /** RF13: o agent consultou estes chamados do funcionário; `isOverdue` confere o prazo que as tools devolveram. */
    ticketLookup: z
      .strictObject({
        numbers: z.array(ticketNumberSchema).min(1),
        isOverdue: z.boolean().optional(),
      })
      .optional(),
    /**
     * Única expectativa sobre texto, para o que só existe na prosa (ex.: a oferta de analista) e
     * para vazamentos de privacidade. Expressões regulares, sem diferenciar maiúsculas.
     */
    reply: z
      .strictObject({
        mustMatch: z.array(regexSourceSchema).min(1).optional(),
        mustNotMatch: z.array(regexSourceSchema).min(1).optional(),
      })
      .refine((reply) => Object.keys(reply).length > 0, { message: "expectativa de texto vazia" })
      .optional(),
  })
  .refine((expectation) => Object.keys(expectation).length > 0, {
    message: "expectativa vazia: todo turno precisa checar alguma coisa",
  });
export type TurnExpectation = z.infer<typeof turnExpectationSchema>;

const employeeIds = new Set<string>(
  DEMO_USERS.filter((user) => user.role === "employee").map((user) => user.id),
);

export const evalScenarioSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id em kebab-case"),
  category: z.enum(EVAL_CATEGORIES),
  /** Frase curta, em português, do que o cenário testa. */
  description: z.string().min(1),
  /** Funcionário de demonstração que conversa; é o dono de tudo que o agent pode ver (RN09). */
  employeeId: z.string().refine((id) => employeeIds.has(id), {
    message: "funcionário de demonstração inexistente",
  }),
  /**
   * O modelo falso, roteirizado por palavras-chave, não consegue exercitar este cenário: no modo
   * mock ele é ignorado com aviso, nunca adaptado.
   */
  requiresRealModel: z.boolean(),
  turns: z
    .array(z.strictObject({ message: z.string().min(1), expect: turnExpectationSchema }))
    .min(1),
});
export type EvalScenario = z.infer<typeof evalScenarioSchema>;

export class InvalidScenariosError extends Error {
  override name = "InvalidScenariosError";
}

/** Cada categoria pedida pelo critério tem pelo menos um cenário. */
function missingCategories(scenarios: readonly EvalScenario[]): EvalCategory[] {
  const present = new Set(scenarios.map((scenario) => scenario.category));
  return EVAL_CATEGORIES.filter((category) => !present.has(category));
}

function duplicatedIds(scenarios: readonly EvalScenario[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const { id } of scenarios) {
    if (seen.has(id)) duplicated.add(id);
    seen.add(id);
  }
  return [...duplicated];
}

/**
 * Lê o conjunto de cenários vindo de fora (um arquivo de dados, por exemplo): schema de cada um,
 * ids únicos e todas as categorias cobertas. Falha com todos os problemas de uma vez.
 */
export function parseScenarioSet(raw: unknown): EvalScenario[] {
  const parsed = z.array(evalScenarioSchema).min(1).safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `- ${issue.path.join(".") || "(raiz)"}: ${issue.message}`,
    );
    throw new InvalidScenariosError(`Cenários inválidos:\n${problems.join("\n")}`);
  }
  const problems = [
    ...duplicatedIds(parsed.data).map((id) => `- id repetido: ${id}`),
    ...missingCategories(parsed.data).map((category) => `- categoria sem cenário: ${category}`),
  ];
  if (problems.length > 0) {
    throw new InvalidScenariosError(`Cenários inválidos:\n${problems.join("\n")}`);
  }
  return parsed.data;
}
