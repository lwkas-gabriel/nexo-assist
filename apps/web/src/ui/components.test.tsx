import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "../test-setup.ts";
import { Avatar } from "./Avatar.tsx";
import { Button } from "./Button.tsx";
import { Kbd } from "./Feedback.tsx";
import { initialsOf } from "./initials.ts";
import { Pill } from "./Pill.tsx";
import { SidePanel } from "./SidePanel.tsx";
import { TextField } from "./TextField.tsx";

describe("componentes base (10.4)", () => {
  it("Button: tipo button por padrão, para não enviar formulários sem querer", () => {
    render(<Button>Entrar</Button>);

    expect(screen.getByRole("button", { name: "Entrar" })).toHaveProperty("type", "button");
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
    expect(screen.getByText("RL")).toBeDefined();
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
    vi.restoreAllMocks();
  });
});

describe("SidePanel (10.6)", () => {
  const panel = (onClose = () => undefined) => (
    <SidePanel title="Detalhe da decisão" open onClose={onClose}>
      <p>Confiança 92%</p>
    </SidePanel>
  );

  it("no desktop (≥ 1280 px) é uma coluna do layout, não um modal", () => {
    setViewportWidth(1440);
    render(panel());

    expect(screen.getByRole("complementary", { name: "Detalhe da decisão" })).toBeDefined();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("no tablet vira gaveta modal, que fecha com Esc e já foca o botão de fechar", async () => {
    setViewportWidth(900);
    const onClose = vi.fn();
    render(panel(onClose));

    expect(screen.getByRole("dialog", { name: "Detalhe da decisão" }).className).toContain(
      "right-0",
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Fechar Detalhe da decisão" }),
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("no celular vira uma folha que sobe de baixo", () => {
    setViewportWidth(390);
    render(panel());

    expect(screen.getByRole("dialog").className).toContain("bottom-0");
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
