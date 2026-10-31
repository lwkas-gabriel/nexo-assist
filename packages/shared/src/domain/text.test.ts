import { describe, expect, it } from "vitest";
import { countSharedTokens, tokenize } from "./text.ts";

describe("tokenize", () => {
  it("ignora acentos, maiúsculas, pontuação e palavras vazias", () => {
    expect(tokenize("A conexão da VPN não funciona!")).toEqual(["conexao", "vpn", "funciona"]);
  });
});

describe("countSharedTokens", () => {
  it("conta as palavras significativas em comum, sem diferenciar acentos", () => {
    expect(countSharedTokens(["vpn", "conexao"], "Sem conexão na VPN")).toBe(2);
  });
});

describe("palavras de pergunta (R13)", () => {
  it("R13: palavras de pergunta não contam como assunto", () => {
    expect(tokenize("Como faço para pedir um software?")).toEqual(["pedir", "software"]);
    expect(
      countSharedTokens(tokenize("Como calibro o teletransportador?"), "Como instalar software"),
    ).toBe(0);
  });
});
