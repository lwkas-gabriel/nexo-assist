import type { UpdateAuthor } from "@nexo/shared/contracts";
import type { DemoUserId } from "@nexo/shared/demo";
import type {
  AffectedScope,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "@nexo/shared/domain";

/**
 * Chamados de demonstração (Anexo B e protótipo), com datas relativas ao momento do seed:
 * os cenários continuam valendo em qualquer dia em que o seed rodar (achado R08).
 */
export type DemoTicket = {
  number: string;
  type: TicketType;
  sequence: number;
  ownerId: DemoUserId;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  affected: AffectedScope;
  title: string;
  description: string;
  createdAt: Date;
  lastStaffUpdateAt: Date | null;
  resolvedAt: Date | null;
  updates: { author: UpdateAuthor; message: string; at: Date }[];
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function buildDemoTickets(now: Date): DemoTicket[] {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const days = (count: number) => ago(count * DAY_MS);

  return [
    // Ana Souza: os chamados das telas 3, 4 e 5 do protótipo.
    {
      number: "INC-20311",
      type: "incident",
      sequence: 20311,
      ownerId: "emp-ana-souza",
      category: "hardware",
      priority: "medium",
      status: "waiting_analyst",
      affected: "just_me",
      title: "Notebook lento após atualização do Windows",
      description:
        "Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.",
      createdAt: days(13),
      // Vencido: média tem 3 dias úteis, e a última atualização da TI foi há 6 dias.
      lastStaffUpdateAt: days(6),
      resolvedAt: null,
      updates: [
        { author: "system", message: "Chamado aberto pelo Nexo Assist.", at: days(13) },
        {
          author: "staff",
          message: "Coletamos os logs; vamos analisar o driver de vídeo.",
          at: days(6),
        },
      ],
    },
    {
      number: "INC-20298",
      type: "incident",
      sequence: 20298,
      ownerId: "emp-ana-souza",
      category: "access",
      priority: "medium",
      status: "in_progress",
      affected: "just_me",
      title: "Acesso à pasta Financeiro no SharePoint",
      description: "Perdi o acesso à pasta Financeiro no SharePoint depois da troca de equipe.",
      createdAt: days(15),
      lastStaffUpdateAt: days(1),
      resolvedAt: null,
      updates: [
        { author: "system", message: "Chamado aberto pelo Nexo Assist.", at: days(15) },
        { author: "staff", message: "Pedido de acesso enviado ao dono da pasta.", at: days(1) },
      ],
    },
    {
      number: "REQ-10442",
      type: "request",
      sequence: 10442,
      ownerId: "emp-ana-souza",
      category: "hardware",
      priority: "low",
      status: "approved",
      affected: "just_me",
      title: "Segundo monitor para home office",
      description:
        "Preciso de um segundo monitor para trabalhar de casa com as planilhas de fechamento.",
      createdAt: days(10),
      lastStaffUpdateAt: days(7),
      resolvedAt: null,
      updates: [
        { author: "system", message: "Pedido aberto pelo Nexo Assist.", at: days(10) },
        {
          author: "staff",
          message: "Pedido aprovado pelo gestor; aguardando estoque.",
          at: days(7),
        },
      ],
    },
    {
      number: "INC-20150",
      type: "incident",
      sequence: 20150,
      ownerId: "emp-ana-souza",
      category: "access",
      priority: "medium",
      status: "resolved",
      affected: "just_me",
      title: "Senha do SAP bloqueada",
      description: "A senha do SAP foi bloqueada depois de três tentativas erradas.",
      createdAt: days(6),
      lastStaffUpdateAt: days(4),
      // Resolvido há 4 dias: ainda pode ser reaberto (RN06).
      resolvedAt: days(4),
      updates: [
        { author: "system", message: "Chamado aberto pelo Nexo Assist.", at: days(6) },
        { author: "staff", message: "Senha desbloqueada e redefinida.", at: days(4) },
      ],
    },
    {
      number: "INC-19877",
      type: "incident",
      sequence: 19877,
      ownerId: "emp-ana-souza",
      category: "email",
      priority: "low",
      status: "resolved",
      affected: "just_me",
      title: "Outlook não sincroniza no celular",
      description: "Os e-mails pararam de chegar no aplicativo do Outlook no celular.",
      createdAt: days(60),
      lastStaffUpdateAt: days(57),
      resolvedAt: days(57),
      updates: [{ author: "staff", message: "Conta reconfigurada no aplicativo.", at: days(57) }],
    },
    {
      number: "INC-19410",
      type: "incident",
      sequence: 19410,
      ownerId: "emp-ana-souza",
      category: "access",
      priority: "low",
      status: "resolved",
      affected: "just_me",
      title: "Troca de senha da rede",
      description: "Senha da rede expirada; não consigo trocar pelo portal.",
      createdAt: days(112),
      lastStaffUpdateAt: days(110),
      resolvedAt: days(110),
      updates: [{ author: "staff", message: "Senha redefinida com o funcionário.", at: days(110) }],
    },
    // Outros funcionários: para o console e para os testes de privacidade.
    {
      number: "REQ-10460",
      type: "request",
      sequence: 10460,
      ownerId: "emp-carla-mendes",
      category: "access",
      priority: "high",
      status: "new",
      affected: "just_me",
      title: "Acesso ao SAP ainda hoje",
      description:
        "Preciso de acesso ao módulo de contas a pagar do SAP ainda hoje para fechar o mês.",
      createdAt: ago(35 * MINUTE_MS),
      lastStaffUpdateAt: null,
      resolvedAt: null,
      updates: [
        { author: "system", message: "Pedido aberto pelo Nexo Assist.", at: ago(35 * MINUTE_MS) },
      ],
    },
    {
      number: "INC-20480",
      type: "incident",
      sequence: 20480,
      ownerId: "emp-bruno-tavares",
      category: "hardware",
      priority: "medium",
      status: "in_progress",
      affected: "my_team",
      title: "Impressora do 3º andar não imprime",
      description:
        "A impressora do 3º andar aparece como offline para toda a equipe comercial; usamos a do 2º andar.",
      createdAt: days(2),
      lastStaffUpdateAt: days(1),
      resolvedAt: null,
      updates: [{ author: "staff", message: "Técnico agendado para hoje à tarde.", at: days(1) }],
    },
    {
      number: "INC-20501",
      type: "incident",
      sequence: 20501,
      ownerId: "emp-elisa-prado",
      category: "software",
      priority: "medium",
      status: "new",
      affected: "just_me",
      title: "Excel fecha sozinho com planilhas grandes",
      description: "O Excel fecha sem aviso ao abrir planilhas com mais de 50 mil linhas.",
      createdAt: ago(3 * HOUR_MS),
      lastStaffUpdateAt: null,
      resolvedAt: null,
      updates: [
        { author: "system", message: "Chamado aberto pelo Nexo Assist.", at: ago(3 * HOUR_MS) },
      ],
    },
    {
      number: "INC-20502",
      type: "incident",
      sequence: 20502,
      ownerId: "emp-diego-ramos",
      category: "network_vpn",
      priority: "medium",
      status: "waiting_analyst",
      affected: "just_me",
      title: "VPN cai toda hora",
      description: "A VPN desconecta várias vezes por dia; reconectar funciona por alguns minutos.",
      createdAt: days(1),
      lastStaffUpdateAt: null,
      resolvedAt: null,
      updates: [{ author: "system", message: "Chamado aberto pelo Nexo Assist.", at: days(1) }],
    },
  ];
}
