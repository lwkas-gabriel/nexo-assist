import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DraftView } from "../chat-api.ts";
import { Composer, SessionLimitNotice } from "./Composer.tsx";
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
  const handlers = {
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onEdit: vi.fn(() => Promise.resolve()),
  };
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

  it("editar leva o foco ao primeiro campo, e o formulário fecha quando a api aceita", async () => {
    renderCard(pendingDraft);

    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Título"));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.queryByRole("form", { name: "Editar rascunho" })).toBeNull();
  });

  it("com erro da api, o formulário fica aberto com o que foi digitado", async () => {
    renderCard(pendingDraft, { onEdit: vi.fn(() => Promise.reject(new Error("falhou"))) });

    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.type(screen.getByLabelText("Título"), " (urgente)");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(screen.getByLabelText("Título")).toHaveProperty(
      "value",
      "VPN não conecta no notebook — erro 809 (urgente)",
    );
  });

  it("RN03: título curto demais não é enviado, e o motivo aparece", async () => {
    const handlers = renderCard(pendingDraft);

    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    await userEvent.clear(screen.getByLabelText("Título"));
    await userEvent.type(screen.getByLabelText("Título"), "VPN");

    expect(screen.getByText("O título precisa de pelo menos 5 caracteres.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Salvar" })).toHaveProperty("disabled", true);
    expect(handlers.onEdit).not.toHaveBeenCalled();
  });

  it("R33: o Confirmar anuncia o atalho de teclado", () => {
    renderCard(pendingDraft);

    expect(
      screen.getByRole("button", { name: /Confirmar/ }).getAttribute("aria-keyshortcuts"),
    ).toMatch(/^(Control|Meta)\+Enter$/);
  });

  it("cancelado não mostra prazo de resposta", () => {
    renderCard({ ...pendingDraft, status: "cancelled" });

    expect(screen.getByText("Cancelado")).toBeDefined();
    expect(screen.queryByText(/resposta até/)).toBeNull();
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

  it("R33: no Mac, ⌘+Enter também confirma", async () => {
    const props = renderComposer();
    await userEvent.click(screen.getByLabelText("Mensagem para o Nexo"));

    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

    expect(props.onConfirmDraft).toHaveBeenCalledOnce();
  });

  it("R34: número com Ctrl, Alt ou ⌘ é atalho do navegador, não resposta rápida", async () => {
    const props = renderComposer();
    await userEvent.click(screen.getByLabelText("Mensagem para o Nexo"));

    await userEvent.keyboard("{Control>}2{/Control}{Alt>}1{/Alt}");

    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("Enter envia o texto e limpa o campo", async () => {
    const props = renderComposer();

    await userEvent.type(screen.getByLabelText("Mensagem para o Nexo"), "Minha VPN caiu{Enter}");

    expect(props.onSend).toHaveBeenCalledWith("Minha VPN caiu");
    expect(screen.getByLabelText("Mensagem para o Nexo")).toHaveProperty("value", "");
  });
});

describe("limite da sessão (RN14)", () => {
  it("a falha de um dos botões aparece no aviso", () => {
    render(
      <SessionLimitNotice
        isWorking={false}
        error="Sistema de chamados indisponível."
        onNewSession={() => undefined}
        onTalkToAnalyst={() => undefined}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("Sistema de chamados indisponível.");
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
