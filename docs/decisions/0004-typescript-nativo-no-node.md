# ADR-0004: TypeScript executado nativamente pelo Node 24, TypeScript fixado na 6.0

**Status:** Aceita (29/10/2026)

## Contexto
Na T01, o Vite falhou ao carregar o `vite.config.ts` porque o Node não resolve imports sem extensão do pacote `shared`. Ao mesmo tempo, o Node 24 já executa TypeScript nativamente, removendo os tipos. Separadamente, a versão mais recente do TypeScript (7.0, reescrita em Go) ainda não é suportada pelo `typescript-eslint`, que aceita no máximo a 6.0.

## Decisão
- Imports relativos com **extensão explícita** (`./app.ts`), com `allowImportingTsExtensions` e `erasableSyntaxOnly` no `tsconfig.base.json`.
- Os servidores rodam com `node src/server.ts` (no dev, `node --watch`), **sem etapa de build e sem tsx**. O `tsc` só checa tipos (`noEmit`).
- **TypeScript fixado em 6.0.3** até o `typescript-eslint` suportar a 7.

## Alternativas descartadas
- **tsx/esbuild para rodar e empacotar os servidores:** mais uma ferramenta e um build para manter, sem ganho.
- **TypeScript 7:** quebraria o lint com checagem de tipos.

## Consequências
- O mesmo código roda igual no Node, no Vite, no Vitest e no Playwright.
- `enum`, `namespace` e parameter properties ficam proibidos (o compilador barra), o que também simplifica o código.
- Rever a versão do TypeScript quando o `typescript-eslint` suportar a 7.
