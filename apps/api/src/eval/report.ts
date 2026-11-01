import type { Check } from "./evaluate.ts";
import type { EvaluationReport, ScenarioResult, ScenarioStatus } from "./run-evaluation.ts";

/** Texto do relatório para o terminal (tabela por cenário e resumo por categoria). */

const STATUS_LABELS: Record<ScenarioStatus, string> = {
  passed: "ok",
  failed: "FALHOU",
  not_evaluated: "não avaliado",
};

const COLUMN_WIDTHS = { id: 38, status: 12, expected: 40, chosen: 40 } as const;
const COLUMN_GAP = "  ";

/** Quebra o texto em linhas de até `width` caracteres, nos espaços. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function renderRow(cells: readonly [string, string, string, string]): string[] {
  const widths = Object.values(COLUMN_WIDTHS);
  const columns = cells.map((cell, index) => wrap(cell, widths[index] ?? 0));
  const height = Math.max(...columns.map((lines) => lines.length));
  return Array.from({ length: height }, (_, row) =>
    columns
      .map((lines, index) => (lines[row] ?? "").padEnd(widths[index] ?? 0))
      .join(COLUMN_GAP)
      .trimEnd(),
  );
}

function renderTable(scenarios: readonly ScenarioResult[]): string[] {
  const header = renderRow(["CENÁRIO", "RESULTADO", "AÇÃO ESPERADA", "AÇÃO ESCOLHIDA"]);
  const separator = "-".repeat(
    Object.values(COLUMN_WIDTHS).reduce((total, width) => total + width + COLUMN_GAP.length, 0),
  );
  const rows = scenarios.flatMap((scenario) => [
    ...renderRow([scenario.id, STATUS_LABELS[scenario.status], scenario.expected, scenario.chosen]),
    "",
  ]);
  return [...header, separator, ...rows];
}

function describeCheck(check: Check): string {
  const where = check.turn === null ? "conversa" : `turno ${check.turn}`;
  return `${where} · ${check.rule}: esperado ${check.expected}; obtido ${check.actual}`;
}

function renderProblems(scenarios: readonly ScenarioResult[]): string[] {
  const problems = scenarios.filter((scenario) => scenario.status !== "passed");
  if (problems.length === 0) return [];
  return [
    "Detalhes dos cenários que não passaram:",
    ...problems.flatMap((scenario) => [
      `- ${scenario.id} (${STATUS_LABELS[scenario.status]})${scenario.reason ? `: ${scenario.reason}` : ""}`,
      ...scenario.failedChecks.map((check) => `    ${describeCheck(check)}`),
    ]),
    "",
  ];
}

function formatPercent(percentPassed: number | null): string {
  return percentPassed === null ? "—" : `${percentPassed}%`;
}

function renderSummary(report: EvaluationReport): string[] {
  const rows = report.categories.map((category) => {
    const evaluated = category.passed + category.failed;
    const note = category.notEvaluated > 0 ? ` (${category.notEvaluated} não avaliado(s))` : "";
    return `  ${category.label.padEnd(42)} ${category.passed}/${evaluated}  ${formatPercent(category.percentPassed)}${note}`;
  });
  const { totals } = report;
  const evaluated = totals.passed + totals.failed;
  return [
    "Resumo por categoria (passaram/avaliados):",
    ...rows,
    "",
    `Total: ${totals.passed}/${evaluated} avaliados passaram (${formatPercent(totals.percentPassed)}); ${totals.failed} falhou(aram); ${totals.notEvaluated} não avaliado(s).`,
  ];
}

export function formatReport(report: EvaluationReport): string {
  const banner = report.warnings.flatMap((warning) => [
    "!".repeat(78),
    ...wrap(warning, 78),
    "!".repeat(78),
    "",
  ]);
  const modelLine =
    report.mode === "gemini"
      ? `Modo: gemini · modelo ${report.model ?? "?"} · nota real desta execução`
      : "Modo: mock";
  return [
    ...banner,
    modelLine,
    "",
    ...renderTable(report.scenarios),
    ...renderProblems(report.scenarios),
    ...renderSummary(report),
    "",
    ...banner,
  ].join("\n");
}

/** 1 se algum cenário falhou; 2 se nada pôde ser avaliado; 0 caso contrário. */
export function exitCodeOf(report: EvaluationReport): number {
  if (report.totals.failed > 0) return 1;
  if (report.totals.passed === 0) return 2;
  return 0;
}
