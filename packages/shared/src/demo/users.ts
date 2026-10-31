/**
 * Pessoas de demonstração (Anexo B), com os nomes do protótipo.
 * A mesma lista alimenta o login da api e os chamados do tickets-service, para os ids baterem.
 */
export const USER_ROLES = ["employee", "analyst"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type DemoUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Setor do funcionário, ou nível de suporte do analista (aparece no console). */
  department: string;
};

export const DEMO_USERS = [
  {
    id: "emp-ana-souza",
    name: "Ana Souza",
    email: "ana.souza@nexo.com.br",
    role: "employee",
    department: "Financeiro",
  },
  {
    id: "emp-bruno-tavares",
    name: "Bruno Tavares",
    email: "bruno.tavares@nexo.com.br",
    role: "employee",
    department: "Comercial",
  },
  {
    id: "emp-carla-mendes",
    name: "Carla Mendes",
    email: "carla.mendes@nexo.com.br",
    role: "employee",
    department: "Controladoria",
  },
  {
    id: "emp-diego-ramos",
    name: "Diego Ramos",
    email: "diego.ramos@nexo.com.br",
    role: "employee",
    department: "Engenharia",
  },
  {
    id: "emp-elisa-prado",
    name: "Elisa Prado",
    email: "elisa.prado@nexo.com.br",
    role: "employee",
    department: "Marketing",
  },
  {
    id: "emp-fabio-nunes",
    name: "Fábio Nunes",
    email: "fabio.nunes@nexo.com.br",
    role: "employee",
    department: "Jurídico",
  },
  {
    id: "emp-gabriela-rocha",
    name: "Gabriela Rocha",
    email: "gabriela.rocha@nexo.com.br",
    role: "employee",
    department: "Compras",
  },
  {
    id: "ana-rafael-lima",
    name: "Rafael Lima",
    email: "rafael.lima@nexo.com.br",
    role: "analyst",
    department: "Suporte N2",
  },
  {
    id: "ana-juliana-costa",
    name: "Juliana Costa",
    email: "juliana.costa@nexo.com.br",
    role: "analyst",
    department: "Suporte N1",
  },
] as const satisfies readonly DemoUser[];

export type DemoUserId = (typeof DEMO_USERS)[number]["id"];

/** Busca o usuário de demonstração pelo id (ou falha alto: o seed não pode referenciar alguém inexistente). */
export function demoUser(id: DemoUserId): DemoUser {
  const user = DEMO_USERS.find((candidate) => candidate.id === id);
  if (!user) throw new Error(`Usuário de demonstração inexistente: ${id}`);
  return user;
}
