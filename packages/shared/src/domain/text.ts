/** Palavras comuns que não ajudam a distinguir um assunto de outro. */
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
  // Palavras de pergunta e de ligação: "Como faço..." não pode achar todo artigo que começa com "Como".
  "como",
  "qual",
  "quais",
  "onde",
  "quando",
  "porque",
  "faco",
  "fazer",
  "posso",
  "pode",
  "ou",
  "sobre",
  "eu",
  "me",
  "isso",
  "esse",
  "essa",
  "ja",
  "tem",
  "seu",
  "sua",
  "voce",
  "pra",
  "pro",
]);

/**
 * Palavras significativas de um texto: minúsculas, sem acentos, sem pontuação e sem palavras vazias.
 * Base da busca na central de ajuda e da detecção de chamados duplicados.
 */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/** Quantas palavras significativas de `query` aparecem em `text`. */
export function countSharedTokens(query: readonly string[], text: string): number {
  const textTokens = new Set(tokenize(text));
  return query.filter((token) => textTokens.has(token)).length;
}
