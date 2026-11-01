import { describe, expect, it } from "vitest";
import {
  EVAL_CATEGORIES,
  InvalidScenariosError,
  parseScenarioSet,
  turnExpectationSchema,
} from "./scenario-schema.ts";

/** Um cenário mínimo e válido, para os testes mudarem só o campo que querem quebrar. */
function scenario(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cenario-de-teste",
    category: "knowledge",
    description: "Cenário de teste",
    employeeId: "emp-henrique-alves",
    requiresRealModel: false,
    turns: [{ message: "Oi", expect: { ticketsCreated: 0 } }],
    ...overrides,
  };
}

/** Um conjunto válido: um cenário por categoria, com ids diferentes. */
function validSet(): Record<string, unknown>[] {
  return EVAL_CATEGORIES.map((category) =>
    scenario({ id: `cenario-${category}`.replaceAll("_", "-"), category }),
  );
}

function problemsOf(raw: unknown): string {
  try {
    parseScenarioSet(raw);
  } catch (error) {
    if (error instanceof InvalidScenariosError) return error.message;
    throw error;
  }
  return "";
}

describe("validação dos cenários da avaliação", () => {
  it("aceita um conjunto válido", () => {
    expect(parseScenarioSet(validSet())).toHaveLength(EVAL_CATEGORIES.length);
  });

  it("recusa ids repetidos", () => {
    const set = [...validSet(), scenario({ id: "cenario-knowledge" })];

    expect(problemsOf(set)).toContain("id repetido: cenario-knowledge");
  });

  it("recusa um conjunto que deixa categorias sem cenário", () => {
    const problems = problemsOf([scenario()]);

    expect(problems).toContain("categoria sem cenário: privacy");
    expect(problems).toContain("categoria sem cenário: duplicate");
  });

  it("recusa funcionário que não existe na demonstração e analista no lugar de funcionário", () => {
    expect(problemsOf([scenario({ employeeId: "emp-inexistente" })])).toContain("0.employeeId:");
    expect(problemsOf([scenario({ employeeId: "ana-rafael-lima" })])).toContain("0.employeeId:");
  });

  it("recusa categoria desconhecida e id fora do kebab-case", () => {
    expect(problemsOf([scenario({ category: "outra" })])).toContain("0.category:");
    expect(problemsOf([scenario({ id: "Cenário Ruim" })])).toContain("0.id: id em kebab-case");
  });

  it("recusa cenário sem turnos e turno sem mensagem", () => {
    expect(problemsOf([scenario({ turns: [] })])).toContain("0.turns:");
    expect(
      problemsOf([scenario({ turns: [{ message: "", expect: { ticketsCreated: 0 } }] })]),
    ).toContain("0.turns.0.message:");
  });

  it("recusa campos que o schema não conhece (erro de digitação não passa em silêncio)", () => {
    const typo = scenario({
      turns: [{ message: "Oi", expect: { ticketsCreated: 0, ticketCreated: 1 } }],
    });
    const withExtra = validSet();
    withExtra[0] = { ...withExtra[0], extra: true };

    expect(problemsOf([typo, ...validSet().slice(1)])).toContain("ticketCreated");
    expect(problemsOf(withExtra)).toContain("extra");
  });

  it("recusa requiresRealModel ausente (a escolha é explícita)", () => {
    const incomplete = scenario();
    delete incomplete.requiresRealModel;

    expect(problemsOf([incomplete])).toContain("0.requiresRealModel:");
  });

  it("lista todos os problemas de uma vez", () => {
    const problems = problemsOf([scenario({ employeeId: "x", category: "y" })]);

    expect(problems).toContain("0.employeeId:");
    expect(problems).toContain("0.category:");
  });
});

describe("validação das expectativas de um turno", () => {
  const accepts = (expectation: unknown) => turnExpectationSchema.safeParse(expectation).success;

  it("recusa expectativa vazia: todo turno precisa checar alguma coisa", () => {
    expect(accepts({})).toBe(false);
    expect(accepts({ tools: {} })).toBe(false);
    expect(accepts({ draft: {} })).toBe(false);
    expect(accepts({ handoff: {} })).toBe(false);
    expect(accepts({ reply: {} })).toBe(false);
  });

  it("recusa tool que o agent não tem", () => {
    expect(accepts({ tools: { mustCall: ["delete_everything"] } })).toBe(false);
    expect(accepts({ tools: { mustCall: ["confirm_draft"] } })).toBe(true);
  });

  it("recusa 'none' combinado com outras expectativas de tools", () => {
    expect(accepts({ tools: { none: true, mustCall: ["get_ticket"] } })).toBe(false);
    expect(accepts({ tools: { none: true } })).toBe(true);
  });

  it("recusa valores fora do domínio: prioridade, tipo, intenção, motivo e nível", () => {
    expect(accepts({ draft: { priority: "urgent" } })).toBe(false);
    expect(accepts({ draft: { type: "bug" } })).toBe(false);
    expect(accepts({ intent: "chitchat" })).toBe(false);
    expect(accepts({ handoff: { reason: "boredom" } })).toBe(false);
    expect(accepts({ handoff: { supportLevel: "N3" } })).toBe(false);
  });

  it("recusa número de chamado fora do formato e expressão regular inválida", () => {
    expect(accepts({ duplicateOf: "chamado 12" })).toBe(false);
    expect(accepts({ ticketLookup: { numbers: ["INC-1"] } })).toBe(false);
    expect(accepts({ reply: { mustMatch: ["("] } })).toBe(false);
    expect(accepts({ reply: { mustMatch: ["analista"] } })).toBe(true);
  });

  it("recusa contagem negativa de chamados criados", () => {
    expect(accepts({ ticketsCreated: -1 })).toBe(false);
    expect(accepts({ ticketsCreated: 0 })).toBe(true);
  });
});
