import { describe, expect, it } from "vitest";
import { ApiError, GENERIC_MESSAGE } from "./api-client.ts";
import { queryViewOf } from "./query-view.ts";

const idle = {
  data: undefined,
  error: null,
  isPlaceholderData: false,
  isFetching: false,
  errorUpdatedAt: 0,
};

describe("queryViewOf (10.5)", () => {
  it("sem dados e sem erro, está carregando", () => {
    expect(queryViewOf({ ...idle, isFetching: true })).toEqual({ status: "loading" });
  });

  it("sem dados e com erro da api, mostra a mensagem dela", () => {
    const error = new ApiError("TICKETS_UNAVAILABLE", "O sistema de chamados não respondeu.", 503);

    expect(queryViewOf({ ...idle, error })).toEqual({
      status: "error",
      message: "O sistema de chamados não respondeu.",
    });
  });

  it("nova tentativa depois de uma falha segue como erro, sem piscar o carregamento", () => {
    expect(queryViewOf({ ...idle, isFetching: true, errorUpdatedAt: 5 })).toEqual({
      status: "error",
      message: GENERIC_MESSAGE,
    });
  });

  it("erro que não é da api (nada técnico na tela) vira a frase genérica", () => {
    expect(queryViewOf({ ...idle, error: new TypeError("Failed to fetch") })).toEqual({
      status: "error",
      message: GENERIC_MESSAGE,
    });
  });

  it("com dados e uma atualização que falhou, a tela fica e avisa que está desatualizada", () => {
    const view = queryViewOf({
      ...idle,
      data: ["a"],
      error: new ApiError("NETWORK", GENERIC_MESSAGE, 0),
      errorUpdatedAt: 5,
    });

    expect(view).toEqual({ status: "ready", data: ["a"], isOutOfSync: true, isSwitching: false });
  });

  it("lista provisória (do filtro anterior) enquanto a nova carrega: pronta e trocando", () => {
    const view = queryViewOf({
      ...idle,
      data: ["velha"],
      isPlaceholderData: true,
      isFetching: true,
    });

    expect(view).toEqual({
      status: "ready",
      data: ["velha"],
      isOutOfSync: false,
      isSwitching: true,
    });
  });

  it("lista provisória de uma consulta que já falhou mostra o erro, não a lista antiga", () => {
    // A nova tentativa apaga o erro e devolve a lista provisória; a falha anterior não pode sumir.
    const view = queryViewOf({
      ...idle,
      data: ["velha"],
      isPlaceholderData: true,
      isFetching: true,
      errorUpdatedAt: 5,
    });

    expect(view).toEqual({ status: "error", message: GENERIC_MESSAGE });
  });

  it("com dados em dia, está pronta e sincronizada", () => {
    expect(queryViewOf({ ...idle, data: [] })).toEqual({
      status: "ready",
      data: [],
      isOutOfSync: false,
      isSwitching: false,
    });
  });
});
