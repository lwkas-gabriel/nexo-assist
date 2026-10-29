import type { UserRow } from "../db/schema.ts";

/** Variáveis disponíveis nas rotas da api: o usuário logado, se houver (preenchido pela sessão). */
export type AppEnv = {
  Variables: {
    user: UserRow | undefined;
  };
};

/** Dados do usuário que podem ir para o navegador. */
export function toUserDto(user: UserRow) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
  };
}
