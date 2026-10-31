/** Custo e latência dos turnos gravados no banco da api (uso: pnpm --filter @nexo/api usage:report). */
import { summarizeUsage } from "./app/usage-report.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db/database.ts";
import { decisionTraces } from "./db/schema.ts";

const config = loadConfig();
const { db, client } = await openDatabase(config.DATABASE_URL);
const rows = await db
  .select({
    conversationId: decisionTraces.conversationId,
    classifierTokens: decisionTraces.classifierTokens,
    agentTokens: decisionTraces.agentTokens,
    latencyMs: decisionTraces.latencyMs,
  })
  .from(decisionTraces);
client.close();

const report = summarizeUsage(rows);
console.log(`Turnos registrados: ${report.turns} em ${report.conversations} conversa(s)`);
console.log(`Tokens por turno (classificador + agent): ${report.tokensPerTurn}`);
console.log(`Tokens por conversa: ${report.tokensPerConversation}`);
console.log(`Latência do turno: p50 ${report.latencyP50Ms} ms, p95 ${report.latencyP95Ms} ms`);
