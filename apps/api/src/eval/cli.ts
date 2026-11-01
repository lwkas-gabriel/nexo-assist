/** Avaliação roteirizada do agent (uso: pnpm eval). Ver o README, seção "Avaliação do agent". */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { systemClock } from "@nexo/shared/domain";
import { loadEvalConfig } from "./config.ts";
import { exitCodeOf, formatReport } from "./report.ts";
import { GEMINI_LIMITS, MOCK_LIMITS, runEvaluation } from "./run-evaluation.ts";
import { EVAL_SCENARIOS } from "./scenarios.ts";

/** Fica fora do git (.gitignore): é o resultado de cada execução, não código. */
const REPORT_FILE = join(import.meta.dirname, "..", "..", "eval-report.json");

const llm = loadEvalConfig();

const report = await runEvaluation({
  scenarios: EVAL_SCENARIOS,
  llm,
  limits: llm.LLM_MODE === "gemini" ? GEMINI_LIMITS : MOCK_LIMITS,
  nowMs: () => systemClock.now().getTime(),
  sleep,
  onScenarioDone: (result) => console.log(`[${result.status}] ${result.id}`),
});

console.log(`\n${formatReport(report)}`);
await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Relatório gravado em ${REPORT_FILE}`);
process.exitCode = exitCodeOf(report);
