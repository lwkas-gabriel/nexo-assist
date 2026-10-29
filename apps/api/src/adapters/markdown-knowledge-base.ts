import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Article, KnowledgeBase } from "../ports/knowledge-base.ts";

/** Palavras comuns que não ajudam a distinguir um artigo de outro. */
const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "com",
  "por",
  "para",
  "que",
  "meu",
  "minha",
  "se",
  "ao",
  "nao",
  "esta",
  "estou",
]);

/** Peso maior para título e tags: são escritos para descrever o assunto do artigo. */
const TITLE_WEIGHT = 3;
const TAG_WEIGHT = 2;
const BODY_WEIGHT = 1;

/**
 * Lê um artigo no formato:
 *   ---
 *   title: Título
 *   tags: tag1, tag2
 *   ---
 *   Corpo do artigo
 */
export function parseArticle(id: string, raw: string): Article {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) {
    throw new Error(`Artigo "${id}" sem cabeçalho (--- title/tags ---)`);
  }
  const [, header = "", body = ""] = match;

  const fields = new Map<string, string>();
  for (const line of header.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }

  const title = fields.get("title");
  if (!title) {
    throw new Error(`Artigo "${id}" sem título`);
  }
  const tags = (fields.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  return { id, title, tags, content: body.trim() };
}

/** Minúsculas, sem acentos, sem pontuação e sem palavras vazias. */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function countMatches(queryTokens: readonly string[], text: string): number {
  const textTokens = new Set(tokenize(text));
  return queryTokens.filter((token) => textTokens.has(token)).length;
}

function scoreArticle(article: Article, queryTokens: readonly string[]): number {
  return (
    countMatches(queryTokens, article.title) * TITLE_WEIGHT +
    countMatches(queryTokens, article.tags.join(" ")) * TAG_WEIGHT +
    countMatches(queryTokens, article.content) * BODY_WEIGHT
  );
}

/** Artigos com alguma relação com a busca, do mais ao menos relevante. */
export function searchArticles(
  articles: readonly Article[],
  query: string,
  limit: number,
): Article[] {
  const queryTokens = [...new Set(tokenize(query))];

  return articles
    .map((article) => ({ article, score: scoreArticle(article, queryTokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ article }) => article);
}

/** Carrega todos os artigos .md de uma pasta uma única vez, na inicialização. */
export function createMarkdownKnowledgeBase(directory: string): KnowledgeBase {
  const articles = readdirSync(directory)
    .filter((file) => file.endsWith(".md"))
    .map((file) =>
      parseArticle(basename(file, ".md"), readFileSync(join(directory, file), "utf8")),
    );

  return {
    search: (query, limit) => searchArticles(articles, query, limit),
  };
}
