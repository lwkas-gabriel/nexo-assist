import { ApiError, apiRequest } from "../../lib/api-client.ts";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "analyst";
  department: string;
};

export type LoginInput = { email: string; password: string; remember: boolean };

/** Quem está logado, ou null se ninguém (401 aqui é uma resposta normal, não um erro). */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const { user } = await apiRequest<{ user: CurrentUser }>("/auth/me");
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function login(input: LoginInput): Promise<CurrentUser> {
  const { user } = await apiRequest<{ user: CurrentUser }>("/auth/login", {
    method: "POST",
    body: input,
  });
  return user;
}

export async function logout(): Promise<void> {
  await apiRequest("/auth/logout", { method: "POST" });
}
