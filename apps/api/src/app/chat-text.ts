import type { UIMessage } from "ai";

/** O texto de uma mensagem, sem as partes de tool (prévia no console, transcrição, R04). */
export function textOf(parts: UIMessage["parts"]): string {
  return parts.map((part) => (part.type === "text" ? part.text : "")).join(" ");
}
