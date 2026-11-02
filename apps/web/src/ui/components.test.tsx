import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ANNOUNCE_AFTER_MOUNT_MS } from "../lib/use-announce-after-mount.ts";
import { setViewportWidth } from "../test-setup.ts";
import { Avatar } from "./Avatar.tsx";
import { avatarToneFor } from "./avatar-tones.ts";
import { Button } from "./Button.tsx";
import { EmptyState, ErrorState, Kbd, LoadingState, SyncNotice, Toast } from "./Feedback.tsx";
import { initialsOf } from "./initials.ts";
import { Pill } from "./Pill.tsx";
import { SidePanel } from "./SidePanel.tsx";
import { TextField } from "./TextField.tsx";

describe("componentes base (10.4)", () => {
  it("Button: tipo button por padrão, para não enviar formulários sem querer", () => {
    render(<Button>Confirmar</Button>);

    expect(screen.getByRole("button", { name: "Confirmar" })).toHaveProperty("type", "button");
  });

  it("Button: só o primário grande (o Entrar do login) leva a sombra do CTA", () => {
    render(
      <>
        <Button size="lg">Entrar</Button>
        <Button>Confirmar</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Entrar" }).className).toContain("shadow-cta");
    expect(screen.getByRole("button", { name: "Confirmar" }).className).not.toContain("shadow-cta");
  });

  it("Pill: a cor vem do mapa de status, não da tela", () => {
    render(<Pill tone="warning">Aguardando analista</Pill>);

    expect(screen.getByText("Aguardando analista").className).toContain("text-warning-text");
  });

  it("Avatar: iniciais do primeiro e do último nome", () => {
    expect(initialsOf("Ana Souza")).toBe("AS");
    expect(initialsOf("Maria da Silva Prado")).toBe("MP");
    expect(initialsOf("Rafael")).toBe("R");
    render(<Avatar name="Rafael Lima" />);
    expect(screen.getByText("RL").className).toContain("bg-primary-soft");
  });

  it("Avatar: a mesma pessoa tem sempre a mesma cor na lista do console", () => {
    expect(avatarToneFor("emp-ana-souza")).toBe(avatarToneFor("emp-ana-souza"));
    const tones = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(avatarToneFor));
    expect(tones.size).toBeGreaterThan(1);
  });

  it("TextField: rótulo ligado ao campo, e o erro anunciado nele (10.7)", () => {
    render(<TextField label="E-mail corporativo" error="E-mail ou senha inválidos" />);

    const input = screen.getByLabelText("E-mail corporativo");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe("E-mail ou senha inválidos");
  });

  it("R33: Kbd mostra Ctrl fora do Mac", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0)");

    render(<Kbd keyName="Enter" withModifier />);

    expect(screen.getByText("Ctrl+Enter")).toBeDefined();
  });

  it("Toast: a região de aviso já existe vazia, e só o texto muda; erro é alerta", () => {
    const { rerender } = render(<Toast message={null} />);
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");

    rerender(<Toast message="Rascunho cancelado." />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("Rascunho cancelado.");

    rerender(<Toast message="Não consegui confirmar." tone="danger" />);
    expect(screen.getByRole("alert").textContent).toBe("Não consegui confirmar.");
  });
});

describe("estados de carregamento, erro e vazio (10.5)", () => {
  it("ErrorState: é um alerta, e Tentar novamente chama a nova tentativa", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Não foi possível falar com o servidor." onRetry={onRetry} />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Não foi possível falar com o servidor.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("ErrorState: enquanto tenta, o botão diz Tentando… e fica aria-disabled; sem foco automático", () => {
    render(<ErrorState message="Falhou." onRetry={() => undefined} isRetrying />);

    const button = screen.getByRole("button", { name: "Tentando…" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(document.body);
  });

  it("ErrorState: tentando, o botão não perde o foco e o clique não chama a nova tentativa de novo", async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState message="Falhou." onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: "Tentar novamente" });
    button.focus();

    rerender(<ErrorState message="Falhou." onRetry={onRetry} isRetrying />);
    await userEvent.click(button);

    expect(document.activeElement).toBe(button);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("ErrorState: sem onRetry, não há botão", () => {
    render(<ErrorState message="Falhou." />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("LoadingState: a região nasce vazia e o rótulo entra depois, sem aria-busy, para o leitor de tela anunciar", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(
        <LoadingState label="Carregando conversas">
          <div data-testid="bloco" />
        </LoadingState>,
      );

      const region = screen.getByRole("status");
      expect(region.textContent).toBe("");
      expect(document.querySelector("[aria-busy]")).toBeNull();

      await act(() => vi.advanceTimersByTimeAsync(ANNOUNCE_AFTER_MOUNT_MS + 10));
      expect(screen.getByRole("status")).toBe(region);
      expect(region.textContent).toBe("Carregando conversas");
      expect(screen.getByTestId("bloco").closest("[aria-hidden]")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("SyncNotice: a região já existe vazia, e só o texto muda", () => {
    const { rerender } = render(<SyncNotice message={null} />);
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");

    rerender(<SyncNotice message="Não consegui atualizar agora; tentando de novo." />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("Não consegui atualizar agora; tentando de novo.");

    rerender(<SyncNotice message={null} />);
    expect(region.textContent).toBe("");
  });

  it("EmptyState: título, descrição e uma ação opcional", async () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="Nenhuma conversa neste filtro."
        description="Troque o filtro."
        action={<button onClick={onAction}>Limpar busca</button>}
      />,
    );

    expect(screen.getByText("Nenhuma conversa neste filtro.")).toBeDefined();
    expect(screen.getByText("Troque o filtro.")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});

/** Tela de teste: um botão que abre o painel, conteúdo atrás e um campo dentro do painel. */
function Screen({ tick = 0 }: { tick?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir chamados
      </button>
      <button type="button">Atrás do painel</button>
      <SidePanel
        title="Chamados"
        open={open}
        // Função nova a cada renderização, como o pai costuma passar.
        onClose={() => setOpen(false)}
      >
        <input aria-label="Buscar chamado" data-tick={tick} />
      </SidePanel>
    </div>
  );
}

describe("SidePanel (10.6)", () => {
  it("no desktop (≥ 1280 px) é uma coluna do layout, não um modal", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chamados" }));

    expect(screen.getByRole("complementary", { name: "Chamados" })).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("no tablet vira gaveta modal: foca o fechar, fecha com Esc e devolve o foco", async () => {
    setViewportWidth(900);
    render(<Screen />);
    const opener = screen.getByRole("button", { name: "Abrir chamados" });
    await userEvent.click(opener);

    expect(screen.getByRole("dialog", { name: "Chamados" }).className).toContain("right-0");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Fechar Chamados" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("clique no fundo escuro fecha a gaveta", async () => {
    setViewportWidth(900);
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chamados" }));

    const backdrop = screen.getByRole("dialog").previousElementSibling;
    if (!(backdrop instanceof HTMLElement)) throw new Error("Fundo não encontrado");
    await userEvent.click(backdrop);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("10.7: o Tab dá a volta dentro da gaveta, sem chegar ao conteúdo atrás", async () => {
    setViewportWidth(900);
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chamados" }));

    const visited: (string | null)[] = [];
    for (let step = 0; step < 4; step += 1) {
      await userEvent.tab();
      visited.push(document.activeElement?.getAttribute("aria-label") ?? null);
    }

    expect(visited).toEqual([
      "Buscar chamado",
      "Fechar Chamados",
      "Buscar chamado",
      "Fechar Chamados",
    ]);
  });

  it("nova renderização do pai (ex.: polling) não tira o foco de quem digita no painel", async () => {
    setViewportWidth(900);
    const { rerender } = render(<Screen tick={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chamados" }));
    const search = screen.getByRole("textbox", { name: "Buscar chamado" });
    await userEvent.click(search);

    rerender(<Screen tick={1} />);
    rerender(<Screen tick={2} />);

    expect(document.activeElement).toBe(search);
  });

  it("com a gaveta aberta, a página atrás não rola", async () => {
    setViewportWidth(900);
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chamados" }));

    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
  });

  it("muda de forma junto com a janela: de coluna para gaveta ao estreitar", async () => {
    render(<Screen />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir chamados" }));
    expect(screen.getByRole("complementary")).toBeDefined();

    act(() => setViewportWidth(900));

    expect(screen.getByRole("dialog", { name: "Chamados" })).toBeDefined();
  });

  it("com inlineFrom=laptop, já é coluna no notebook (1024–1279 px)", () => {
    setViewportWidth(1100);
    render(
      <SidePanel title="Detalhe" open inlineFrom="laptop" onClose={() => undefined}>
        <p>conteúdo</p>
      </SidePanel>,
    );

    expect(screen.getByRole("complementary", { name: "Detalhe" })).toBeDefined();
  });

  it("no celular: folha que sobe de baixo, ou tela cheia quando pedido (console)", () => {
    setViewportWidth(390);
    const { rerender } = render(
      <SidePanel title="Detalhe" open onClose={() => undefined}>
        <p>conteúdo</p>
      </SidePanel>,
    );
    expect(screen.getByRole("dialog").className).toContain("bottom-0");

    rerender(
      <SidePanel title="Detalhe" open mobileMode="fullscreen" onClose={() => undefined}>
        <p>conteúdo</p>
      </SidePanel>,
    );
    expect(screen.getByRole("dialog").className).toContain("inset-0");
  });

  it("fechado, não aparece", () => {
    render(
      <SidePanel title="Painel" open={false} onClose={() => undefined}>
        <p>conteúdo</p>
      </SidePanel>,
    );

    expect(screen.queryByText("conteúdo")).toBeNull();
  });
});
