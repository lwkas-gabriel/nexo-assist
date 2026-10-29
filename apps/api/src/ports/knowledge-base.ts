export type Article = {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly content: string;
};

/** Central de ajuda: o agent consulta artigos antes de sugerir abrir um chamado. */
export type KnowledgeBase = {
  search(query: string, limit: number): readonly Article[];
};
