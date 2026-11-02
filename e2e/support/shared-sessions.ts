import { ANA_EMAIL } from "./login.ts";

/**
 * Entrar pelo formulário custa uma das 20 tentativas de login por minuto do IP (RT10), e o E2E
 * inteiro roda do mesmo IP, nos dois projetos. Os testes de estados só precisam de alguém logado:
 * o projeto `setup` entra uma vez com cada conta e guarda a sessão em arquivo (ignorado pelo git).
 */
export const SHARED_SESSIONS = {
  ana: { email: ANA_EMAIL, file: "e2e/.auth/ana.json" },
  juliana: { email: "juliana.costa@nexo.com.br", file: "e2e/.auth/juliana.json" },
} as const;
