import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { countSharedTokens, tokenize } from "@nexo/shared/domain";
import type { Article, KnowledgeBase } from "../ports/knowledge-base.ts";

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

function scoreArticle(article: Article, queryTokens: readonly string[]): number {
  return (
    countSharedTokens(queryTokens, article.title) * TITLE_WEIGHT +
    countSharedTokens(queryTokens, article.tags.join(" ")) * TAG_WEIGHT +
    countSharedTokens(queryTokens, article.content) * BODY_WEIGHT
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
