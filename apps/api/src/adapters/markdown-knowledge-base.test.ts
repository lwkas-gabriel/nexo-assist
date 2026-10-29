import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMarkdownKnowledgeBase,
  parseArticle,
  searchArticles,
} from "./markdown-knowledge-base.ts";

const vpn = parseArticle(
  "vpn",
  "---\ntitle: VPN com erro 809\ntags: vpn, conexão\n---\nReinstale o cliente de VPN.",
);
const hours = parseArticle(
  "horario",
  "---\ntitle: Horário do service desk\ntags: atendimento\n---\nDe segunda a sexta, das 8h às 18h.",
);

describe("parseArticle", () => {
  it("lê título, tags e corpo", () => {
    expect(vpn).toEqual({
      id: "vpn",
      title: "VPN com erro 809",
      tags: ["vpn", "conexão"],
      content: "Reinstale o cliente de VPN.",
    });
  });

  it("aceita fim de linha do Windows (CRLF)", () => {
    const article = parseArticle("crlf", "---\r\ntitle: Título\r\ntags: a\r\n---\r\nCorpo");

    expect(article.title).toBe("Título");
    expect(article.content).toBe("Corpo");
  });

  it("recusa artigo sem cabeçalho, para o erro aparecer na inicialização", () => {
    expect(() => parseArticle("ruim", "só corpo")).toThrowError(/sem cabeçalho/);
  });
});

describe("searchArticles", () => {
  it("encontra o artigo pelo assunto, mesmo escrito sem acento", () => {
    const results = searchArticles([vpn, hours], "minha vpn da erro 809, sem conexao", 3);

    expect(results.map((article) => article.id)).toEqual(["vpn"]);
  });

  it("ordena pelo mais relevante", () => {
    // horário: título + tag + corpo; vpn: só "cliente", no corpo
    const results = searchArticles([vpn, hours], "horario de atendimento na segunda, cliente", 3);

    expect(results.map((article) => article.id)).toEqual(["horario", "vpn"]);
  });

  it("não devolve nada quando nenhum artigo tem relação com a busca", () => {
    expect(searchArticles([vpn, hours], "impressora travada", 3)).toEqual([]);
  });

  it("respeita o limite de resultados", () => {
    expect(searchArticles([vpn, hours], "vpn horario", 1)).toHaveLength(1);
  });
});

describe("createMarkdownKnowledgeBase", () => {
  it("carrega os artigos versionados em apps/api/knowledge", () => {
    const knowledgeBase = createMarkdownKnowledgeBase(join(import.meta.dirname, "../../knowledge"));

    expect(knowledgeBase.search("erro 809 na vpn", 1)[0]?.title).toBe("VPN com erro 809");
  });
});

describe("artigos versionados da central de ajuda", () => {
  const knowledgeBase = createMarkdownKnowledgeBase(join(import.meta.dirname, "../../knowledge"));
  const topTitle = (query: string) => knowledgeBase.search(query, 1)[0]?.title;

  it.each([
    ["minha senha da rede expirou", "Senha da rede expirada ou bloqueada"],
    ["outlook do celular parou de sincronizar", "Outlook não sincroniza no celular"],
    ["como instalo o programa de PDF", "Como instalar ou pedir um software"],
    ["notebook muito lento depois da atualização do windows", "Computador ou notebook lento"],
    ["qual a senha do wifi para visitante", "Wi-Fi de visitantes"],
    ["quero saber das minhas férias", "Assuntos que não são de TI"],
  ])("'%s' encontra '%s'", (query, expectedTitle) => {
    expect(topTitle(query)).toBe(expectedTitle);
  });
});
