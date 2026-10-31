import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DraftView } from "../chat-api.ts";
import { Composer } from "./Composer.tsx";
import { DraftCard } from "./DraftCard.tsx";
import { QuickOptions } from "./QuickOptions.tsx";

const pendingDraft: DraftView = {
  draftId: "D-7",
  number: 7,
  kind: "create",
  status: "pending",
  ticketNumber: null,
  ticket: {
    title: "VPN não conecta no notebook — erro 809",
    description: "Desde ontem o notebook não conecta na VPN.",
    type: "Incidente",
    category: "Rede e VPN",
    affected: "Somente você",
    priority: "Alta",
    priorityReason: "RN11: somente você + compromisso hoje → Alta",
    slaRule: "4 horas úteis",
    firstResponseBy: "27/10, 13:43",
  },
  fields: {
    title: "VPN não conecta no notebook — erro 809",
    description: "Desde ontem o notebook não conecta na VPN.",
    type: "incident",
    category: "network_vpn",
    affected: "just_me",
    urgency: "deadline_today",
  },
};

function renderCard(draft: DraftView, overrides: Partial<Parameters<typeof DraftCard>[0]> = {}) {
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn(), onEdit: vi.fn() };
  render(
    <DraftCard
      draft={draft}
      isActionable
      isWorking={false}
      error={null}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const props = {
    isBusy: false,
    onSend: vi.fn(),
    counter: { used: 18, limit: 30 },
    quickOptions: ["Só eu", "Minha equipe", "Toda a empresa"],
    onConfirmDraft: vi.fn(),
    ...overrides,
  };
  render(<Composer {...props} />);
  return props;
}

describe("card do rascunho (RF07, R16, R26)", () => {
  it("R26: mostra o Tipo, que o protótipo omitia, e o prazo da primeira resposta (R35)", () => {
    renderCard(pendingDraft);

    expect(screen.getByText("Incidente")).toBeDefined();
    expect(screen.getByText("· resposta até 27/10, 13:43")).toBeDefined();
    expect(screen.getByText("Aguardando confirmação")).toBeDefined();
  });

  it("RN04: confirmar e cancelar chamam a api (pelos botões, sem o modelo)", async () => {
    const handlers = renderCard(pendingDraft);

    await userEvent.click(screen.getByRole("button", { name: /Confirmar/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(handlers.onConfirm).toHaveBeenCalledOnce();
    expect(handlers.onCancel).toHaveBeenCalledOnce();
  });

  it("R16: editar mostra os campos, sem a prioridade, e envia só pelo Salvar", async () => {
    const handlers = renderCard(pendingDraft);

    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.selectOptions(screen.getByLabelText("Quem é afetado"), "my_team");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.queryByLabelText("Prioridade")).toBeNull();
    expect(handlers.onEdit).toHaveBeenCalledWith(expect.objectContaining({ affected: "my_team" }));
  });

  it("depois de confirmado, mostra o número do chamado e some com os botões", () => {
    renderCard({ ...pendingDraft, status: "confirmed", ticketNumber: "INC-20517" });

    expect(screen.getByText("Criado · INC-20517")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Confirmar/ })).toBeNull();
  });

  it("confirmação que falhou só pode ser repetida (sem editar nem cancelar)", () => {
    renderCard({ ...pendingDraft, status: "confirm_failed" });

    expect(screen.getByRole("button", { name: /Tentar de novo/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
  });

  it("rascunho antigo, que não é o ativo, fica só como registro", () => {
    renderCard(pendingDraft, { isActionable: false });

    expect(screen.queryByRole("button", { name: /Confirmar/ })).toBeNull();
  });
});

describe("campo de mensagem (RF10, R33, R34)", () => {
  it("RF10: mostra o contador da sessão", () => {
    renderComposer();

    expect(screen.getByText("18/30 mensagens nesta sessão")).toBeDefined();
  });

  it("R34: com o campo vazio, as teclas 1 a 4 escolhem a resposta rápida", async () => {
    const props = renderComposer();
    await userEvent.click(screen.getByLabelText("Mensagem para o Nexo"));

    await userEvent.keyboard("2");

    expect(props.onSend).toHaveBeenCalledWith("Minha equipe");
  });

  it("R34: com texto no campo, o número é só texto", async () => {
    const props = renderComposer();

    await userEvent.type(screen.getByLabelText("Mensagem para o Nexo"), "Sala 2");

    expect(props.onSend).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mensagem para o Nexo")).toHaveProperty("value", "Sala 2");
  });

  it("R33: Ctrl+Enter confirma o rascunho pendente", async () => {
    const props = renderComposer();
    await userEvent.click(screen.getByLabelText("Mensagem para o Nexo"));

    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(props.onConfirmDraft).toHaveBeenCalledOnce();
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("Enter envia o texto e limpa o campo", async () => {
    const props = renderComposer();

    await userEvent.type(screen.getByLabelText("Mensagem para o Nexo"), "Minha VPN caiu{Enter}");

    expect(props.onSend).toHaveBeenCalledWith("Minha VPN caiu");
    expect(screen.getByLabelText("Mensagem para o Nexo")).toHaveProperty("value", "");
  });
});

describe("respostas rápidas (RF06)", () => {
  it("só a pergunta mais recente aceita resposta", () => {
    render(
      <QuickOptions
        data={{ question: "Quem está sendo afetado?", options: ["Só eu", "Minha equipe"] }}
        isActive={false}
        onPick={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Só eu" })).toHaveProperty("disabled", true);
  });
});
