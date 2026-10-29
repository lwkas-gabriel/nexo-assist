/**
 * Mescla um .env com o .env.example: mantém o que já existe, acrescenta as variáveis novas
 * e preenche segredos vazios com os valores gerados. Função pura, testada em env-file.test.ts.
 */
export function mergeEnvFile(
  exampleText: string,
  currentText: string | undefined,
  secrets: Readonly<Record<string, string>>,
): { content: string; addedKeys: string[]; filledSecrets: string[] } {
  const base = currentText ?? exampleText;
  const presentKeys = new Set(keysOf(base));
  const filledSecrets: string[] = [];

  // Sem as linhas em branco do fim: as variáveis novas entram logo depois da última existente.
  const lines = base
    .replace(/(\r?\n)+$/, "")
    .split(/\r?\n/)
    .map((line) => {
      const key = keyOf(line);
      const secret = key ? secrets[key] : undefined;
      if (key && secret && valueOf(line) === "") {
        filledSecrets.push(key);
        return `${key}=${secret}`;
      }
      return line;
    });

  const addedKeys =
    currentText === undefined ? [] : keysOf(exampleText).filter((key) => !presentKeys.has(key));
  for (const key of addedKeys) {
    const value =
      secrets[key] ?? valueOf(exampleText.split(/\r?\n/).find((line) => keyOf(line) === key) ?? "");
    if (secrets[key]) filledSecrets.push(key);
    lines.push(`${key}=${value}`);
  }

  const content = `${lines.join("\n").replace(/\n+$/, "")}\n`;
  return { content, addedKeys, filledSecrets };
}

/** Valores já definidos (não vazios) num .env. */
export function readEnvValues(text: string | undefined): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of (text ?? "").split(/\r?\n/)) {
    const key = keyOf(line);
    if (key && valueOf(line) !== "") values.set(key, valueOf(line));
  }
  return values;
}

function keysOf(text: string): string[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const key = keyOf(line);
    return key ? [key] : [];
  });
}

function keyOf(line: string): string | undefined {
  return /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
}

function valueOf(line: string): string {
  return line.slice(line.indexOf("=") + 1).trim();
}
