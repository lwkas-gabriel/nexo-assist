import { AppError, errorBody } from "@nexo/shared/errors";
import { Hono } from "hono";
import type { TicketService } from "./app/ticket-service.ts";
import { requireServiceToken } from "./http/service-token.ts";
import { createTicketRoutes } from "./http/ticket-routes.ts";

type AppDependencies = {
  ticketService: TicketService;
  serviceToken: string;
};

/** Monta as rotas sem abrir porta de rede, para poder ser testado com `app.request()`. */
export function createApp({ ticketService, serviceToken }: AppDependencies) {
  const app = new Hono();

  // Aberto, para o health check da plataforma de deploy; não expõe dados.
  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use("/tickets/*", requireServiceToken(serviceToken));
  app.route("/tickets", createTicketRoutes(ticketService));

  app.notFound((c) => c.json(errorBody("NOT_FOUND", "Rota não encontrada."), 404));

  // Único ponto que transforma erros em respostas HTTP.
  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(errorBody(error.code, error.message), error.httpStatus);
    }
    console.error("Erro inesperado no serviço de chamados", error);
    return c.json(errorBody("INTERNAL", "Erro interno."), 500);
  });

  return app;
}
