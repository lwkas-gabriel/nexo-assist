import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../auth/auth-api.ts";
import { ProfilePage } from "./ProfilePage.tsx";

const ANA: CurrentUser = {
  id: "emp-ana-souza",
  name: "Ana Souza",
  email: "ana.souza@nexo.com.br",
  role: "employee",
  department: "Financeiro",
};

describe("Meu perfil (RF24, A01)", () => {
  it("mostra nome, e-mail gerenciado pela TI e setor, sem campo editável", () => {
    render(<ProfilePage user={ANA} />);

    expect(screen.getByText("Ana Souza")).toBeDefined();
    expect(screen.getByText("ana.souza@nexo.com.br")).toBeDefined();
    expect(screen.getByText("Gerenciado pela TI")).toBeDefined();
    expect(screen.getByText("Financeiro")).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("A01: Redefinir senha avisa que é uma simulação, sem enviar nada", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<ProfilePage user={ANA} />);
    expect(screen.getByRole("status").textContent).toContain("O link de redefinição vai para");

    await userEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));

    // A região viva é a mesma de antes: o leitor de tela ouve a troca do texto.
    expect(screen.getByRole("status").textContent).toContain("qualquer senha entra");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
