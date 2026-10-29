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
