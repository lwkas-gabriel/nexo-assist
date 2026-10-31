import type { DecisionView } from "@nexo/shared/contracts";
import { confidenceLevel } from "@nexo/shared/domain";
import { Check, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../ui/cx.ts";
import {
  confidencePercent,
  extractedFields,
  isCodeDecision,
  stepLabel,
} from "../decision-model.ts";

/**
 * Detalhe da decisão de uma resposta (RF05, 10.4): o que o assistente entendeu, o que fez, que
 * regras o código aplicou, com que confiança e por quê. O conteúdo do painel lateral; quem o
 * abre e onde ele fica (coluna, gaveta ou folha) é o SidePanel.
 */
export function DecisionPanel({ decision }: { decision: DecisionView }) {
  const fields = extractedFields(decision);

  return (
    <div className="flex flex-col gap-5 text-[13.5px] text-ink-2">
      <Section title="O que entendi">
        <p className="text-ink">{decision.understood}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-ink-3">Intenção</dt>
          <dd className="font-medium text-ink">{decision.intent}</dd>
          {fields.map((field) => (
            <Field key={field.label} label={field.label} value={field.value} />
          ))}
        </dl>
      </Section>

      <Section title="O que fiz">
        {decision.steps.length === 0 ? (
          <p>Respondi direto, sem consultar nada.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {decision.steps.map((step, index) => (
              <li key={`${step.tool}-${index}`} className="flex items-start gap-2">
                {step.ok ? (
                  <Check aria-hidden size={14} className="mt-0.5 shrink-0 text-success-text" />
                ) : (
                  <TriangleAlert
                    aria-hidden
                    size={14}
                    className="mt-0.5 shrink-0 text-danger-text"
                  />
                )}
                <span>
                  <span className="font-medium text-ink">{stepLabel(step.tool)}</span>
                  {" · "}
                  {step.outcome}
                  {!step.ok && <span className="sr-only"> (com problema)</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {decision.rules.length > 0 && (
        <Section title="Regras aplicadas">
          <ul className="flex flex-col gap-1">
            {decision.rules.map((rule) => (
              <li key={rule} className="font-data text-[12.5px] text-ink">
                {rule}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Confiança">
        <ConfidenceBar decision={decision} />
        {decision.signals.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {decision.signals.map((signal) => (
              <li key={signal.code}>
                {signal.penalty > 0
                  ? `−${confidencePercent(signal.penalty)} pontos: ${signal.label}`
                  : signal.label}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Por quê">
        <p>{decision.reason}</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[12.5px] font-semibold tracking-[0.2px] text-ink-3 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </>
  );
}

/**
 * Barra da confiança final; abaixo dela, de onde veio (classificador ou botão) e, se os sinais
 * a reduziram, quanto (R09, R40). Abaixo do limiar, em aviso: o assistente pergunta ou transfere.
 */
function ConfidenceBar({ decision }: { decision: DecisionView }) {
  const percent = confidencePercent(decision.finalConfidence);
  const classifierPercent = confidencePercent(decision.classifierConfidence);
  const origin = isCodeDecision(decision)
    ? "Ação por um botão: decidida pelo código, sem o modelo."
    : percent === classifierPercent
      ? `O classificador deu ${classifierPercent}%.`
      : `O classificador deu ${classifierPercent}%; os sinais abaixo reduziram para ${percent}%.`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-ink first-letter:uppercase">
          {confidenceLevel(decision.finalConfidence)}
        </span>
        <span className="font-data text-[12.5px] text-ink">{percent}%</span>
      </div>
      <div
        role="meter"
        aria-label="Confiança"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%`}
        className="h-1.5 overflow-hidden rounded-full bg-desk"
      >
        <div
          className={cx("h-full rounded-full", decision.isLowConfidence ? "bg-warning" : "bg-cta")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-[12.5px] text-ink-3">{origin}</p>
    </div>
  );
}
