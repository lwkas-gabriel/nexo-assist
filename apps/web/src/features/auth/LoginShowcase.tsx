import { useQuery } from "@tanstack/react-query";
import { NexoMark } from "./NexoMark.tsx";
import { fetchLoginStats, formatStat } from "./stats-api.ts";

/**
 * Painel escuro da tela 1: o que o assistente faz, uma conversa de exemplo e os números do
 * atendimento. Aparece a partir de 1024 px (10.6); abaixo disso, a tela é só o formulário.
 */
export function LoginShowcase() {
  return (
    <section
      aria-label="Sobre o Nexo Assist"
      className="hidden flex-col justify-between bg-ink px-16 pt-10 pb-12 text-paper lg:flex lg:w-[45%] xl:w-[800px] xl:shrink-0"
    >
      <div className="flex items-center gap-2.5">
        <NexoMark tone="onDark" />
        <span className="text-[17px] font-bold">Nexo Assist</span>
      </div>

      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-[18px]">
          <p className="text-[13.5px] font-medium text-paper/55">Service desk de TI da Nexo</p>
          <h2 className="font-display text-[40px] leading-[1.05] xl:text-[54px]">
            Seu problema de TI, resolvido em uma conversa.
          </h2>
          <p className="max-w-[520px] text-base text-paper/65">
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central
            de ajuda e chama um analista quando precisa.
          </p>
        </div>
        <ConversationPreview />
      </div>

      <LoginStats />
    </section>
  );
}

/** Exemplo de conversa, só ilustração: a tela diz isso a quem usa leitor de tela. */
function ConversationPreview() {
  return (
    <div className="xl:pl-24">
      <figure
        aria-label="Exemplo de conversa com o assistente"
        className="flex max-w-[500px] flex-col gap-2.5 rounded-xl border border-paper/8 bg-paper/4 p-[18px]"
      >
        <p className="self-end rounded-[12px_12px_4px_12px] bg-paper px-3.5 py-[9px] text-[13.5px] text-ink">
          Meu notebook não conecta na VPN. Erro 809.
        </p>
        <div className="flex flex-col gap-1.5">
          <p className="flex gap-1.5 text-[12.5px]">
            <span className="font-semibold text-paper/80">Nexo Assist</span>
            <span className="text-paper/45">consultou seus chamados · criou um chamado</span>
          </p>
          <p className="max-w-[380px] rounded-[4px_12px_12px_12px] bg-paper/8 px-3.5 py-2.5 text-[13.5px]">
            Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
          </p>
          <p className="flex items-center gap-2 self-start rounded-lg bg-paper px-3 py-[7px] text-[12.5px]">
            <span aria-hidden className="size-[7px] rounded-full bg-warning" />
            <span className="font-semibold text-ink">INC-20517</span>
            <span className="text-ink-3">Rede e VPN · Alta · em até 4 h</span>
          </p>
        </div>
      </figure>
    </div>
  );
}

/** Os três números do atendimento (A11), calculados pela api; sem dado ainda, um travessão. */
function LoginStats() {
  const stats = useQuery({ queryKey: ["login-stats"], queryFn: fetchLoginStats });
  const data = stats.data;
  const items = [
    {
      value: formatStat(data?.firstResponseSeconds ?? null, "s"),
      label: "primeira resposta, em média",
    },
    {
      value: formatStat(data?.resolvedWithoutQueuePercent ?? null, "%"),
      label: "resolvidos sem fila",
    },
    {
      value: data ? String(data.analystsOnline) : "—",
      label: "analistas online agora",
      live: true,
    },
  ];

  return (
    <dl className="grid grid-cols-3 border-t border-paper/10 pt-6">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={
            index === 0
              ? "flex flex-col gap-1.5"
              : "flex flex-col gap-1.5 border-l border-paper/10 pl-6"
          }
        >
          <dt className="order-2 text-[13.5px] text-paper/55">{item.label}</dt>
          <dd className="order-1 flex items-center gap-2 font-display text-[34px] leading-none">
            {item.value}
            {item.live && data && data.analystsOnline > 0 && (
              <span aria-hidden className="size-2 rounded-full bg-success" />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
