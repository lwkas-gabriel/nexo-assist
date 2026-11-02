import { describe, expect, it } from "vitest";
import { exitCodeOf, formatReport } from "./report.ts";
import { MOCK_MODE_WARNING, type EvaluationReport, type ScenarioResult } from "./run-evaluation.ts";

function result(overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    id: "cenario-a",
    category: "knowledge",
    description: "Descrição",
    status: "passed",
    reason: undefined,
    expected: "chama search_knowledge_base",
    chosen: "tools: search_knowledge_base",
    failedChecks: [],
    ...overrides,
  };
}

function report(overrides: Partial<EvaluationReport> = {}): EvaluationReport {
  return {
    mode: "mock",
    model: null,
    warnings: [MOCK_MODE_WARNING],
    scenarios: [result()],
    categories: [
      {
        category: "knowledge",
        label: "dúvida respondida pela central de ajuda",
        passed: 1,
        failed: 0,
        notEvaluated: 0,
        total: 1,
        percentPassed: 100,
      },
      {
        category: "privacy",
        label: "privacidade e prompt injection",
        passed: 0,
        failed: 0,
        notEvaluated: 1,
        total: 1,
        percentPassed: null,
      },
    ],
    totals: { passed: 1, failed: 0, notEvaluated: 1, total: 2, percentPassed: 100 },
    ...overrides,
  };
}

describe("relatório da avaliação", () => {
  it("no mock, avisa em destaque que o resultado não mede a qualidade do modelo", () => {
    const text = formatReport(report());

    expect(text).toContain("NÃO mede a qualidade");
    expect(text).toContain("!!!!!!!!!!");
    expect(text).toContain("Modo: mock");
  });

  it("no gemini, não mostra o aviso do mock e diz o modelo medido", () => {
    const text = formatReport(report({ mode: "gemini", model: "modelo-x", warnings: [] }));

    expect(text).not.toContain("MODO MOCK");
    expect(text).toContain("modelo modelo-x");
  });

  it("no gemini, só diz 'nota real' quando a cobertura é total; cortada pela cota, diz PARCIAL", () => {
    const complete = report({
      mode: "gemini",
      model: "modelo-x",
      warnings: [],
      totals: { passed: 2, failed: 0, notEvaluated: 0, total: 2, percentPassed: 100 },
    });
    const partial = report({
      mode: "gemini",
      model: "modelo-x",
      warnings: [],
      totals: { passed: 1, failed: 0, notEvaluated: 1, total: 2, percentPassed: 100 },
    });

    expect(formatReport(complete)).toContain("nota real desta execução (cobertura total)");
    expect(formatReport(partial)).toContain("PARCIAL: 1 de 2 avaliados");
    expect(formatReport(partial)).not.toContain("nota real");
  });

  it("mostra uma linha por cenário com o resultado, a ação esperada e a escolhida", () => {
    const failing = result({
      id: "cenario-b",
      status: "failed",
      expected: "chama get_ticket",
      chosen: "tools: list_my_tickets",
      failedChecks: [
        {
          rule: "tools.mustCall",
          turn: 1,
          passed: false,
          expected: "chama get_ticket",
          actual: "list_my_tickets",
        },
      ],
    });
    const text = formatReport(report({ scenarios: [result(), failing] }));

    expect(text).toMatch(
      /cenario-a\s+ok\s+chama search_knowledge_base\s+tools: search_knowledge_base/,
    );
    expect(text).toMatch(/cenario-b\s+FALHOU\s+chama get_ticket\s+tools: list_my_tickets/);
    expect(text).toContain(
      "turno 1 · tools.mustCall: esperado chama get_ticket; obtido list_my_tickets",
    );
  });

  it("cenário não avaliado mostra o motivo, nunca como falha", () => {
    const skipped = result({ status: "not_evaluated", reason: "exige modelo real", chosen: "—" });
    const text = formatReport(report({ scenarios: [skipped] }));

    expect(text).toMatch(/não avaliado/);
    expect(text).toContain("exige modelo real");
  });

  it("resume por categoria com o percentual dos avaliados e '—' quando nenhum foi avaliado", () => {
    const text = formatReport(report());

    expect(text).toMatch(
      /dúvida respondida pela central de ajuda\s+1\/1\s+100%\s+\(cobertura 1\/1\)/,
    );
    expect(text).toMatch(/privacidade e prompt injection\s+0\/0\s+—\s+\(cobertura 0\/1\)/);
    expect(text).toContain("Total: 1/1 avaliados passaram (100%); cobertura 1/2");
  });

  it("quebra o texto longo da tabela em várias linhas, sem cortar nenhuma palavra", () => {
    const words = ["comprido", "assim", "largura", "ferramenta"];
    const longText = `chama uma ferramenta com um nome ${words[0]} e outra e mais outra ainda e ${words[1]} por diante até passar da ${words[2]}`;
    const text = formatReport(report({ scenarios: [result({ expected: longText })] }));
    const rowLines = text.split("\n").filter((line) => !line.startsWith("!"));

    for (const word of words) expect(text).toContain(word);
    expect(Math.max(...rowLines.map((line) => line.length))).toBeLessThanOrEqual(140);
  });

  it("código de saída: 1 se algum cenário falhou, 2 se nada passou, 0 se tudo avaliado passou", () => {
    const totals = (passed: number, failed: number, notEvaluated = 0) => ({
      passed,
      failed,
      notEvaluated,
      total: passed + failed + notEvaluated,
      percentPassed: null,
    });

    expect(exitCodeOf(report({ totals: totals(5, 1) }))).toBe(1);
    expect(exitCodeOf(report({ totals: totals(0, 1) }))).toBe(1);
    expect(exitCodeOf(report({ totals: totals(0, 0) }))).toBe(2);
    expect(exitCodeOf(report({ totals: totals(5, 0) }))).toBe(0);
  });

  it("no mock, 'não avaliado' é esperado e não muda o código; no gemini, qualquer um muda", () => {
    const withSkipped = { passed: 5, failed: 0, notEvaluated: 1, total: 6, percentPassed: 100 };

    expect(exitCodeOf(report({ mode: "mock", totals: withSkipped }))).toBe(0);
    expect(exitCodeOf(report({ mode: "gemini", model: "m", totals: withSkipped }))).toBe(2);
  });
});
