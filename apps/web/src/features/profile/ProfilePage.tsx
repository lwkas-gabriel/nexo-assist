import { Info, KeyRound, Lock, RotateCcwKey } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "../../ui/Button.tsx";
import type { CurrentUser } from "../auth/auth-api.ts";

/**
 * Tela "Meu perfil" (RF24, `nexo.pen`), só de leitura (A01): os dados de acesso vêm do cadastro da
 * TI. "Redefinir senha" avisa que é uma simulação: na demonstração, qualquer senha entra e nenhum
 * link é enviado. O protótipo mostra "Alterada há 42 dias"; o sistema não guarda isso, então a
 * tela não inventa a data.
 */
export function ProfilePage({ user }: { user: CurrentUser }) {
  const [showResetNotice, setShowResetNotice] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8 md:px-10 md:py-12">
      <div className="flex max-w-[600px] flex-col gap-8">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-2xl font-bold text-ink">Meu perfil</h2>
          <p className="text-[14.5px] text-ink-3">Seus dados de acesso ao service desk de TI.</p>
        </div>

        <dl className="flex flex-col divide-y divide-rule rounded-xl border border-line bg-paper shadow-card">
          <Row label="Nome">{user.name}</Row>
          <Row label="E-mail corporativo" note="Gerenciado pela TI">
            {user.email}
          </Row>
          <Row label="Setor">{user.department}</Row>
        </dl>

        <section
          aria-labelledby="profile-password"
          className="overflow-hidden rounded-xl border border-line bg-paper shadow-card"
        >
          <div className="flex flex-wrap items-center gap-4 p-6">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-desk text-ink-2">
              <KeyRound aria-hidden size={18} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <h3 id="profile-password" className="text-[14.5px] font-semibold text-ink">
                Senha
              </h3>
              <p className="text-[13.5px] text-ink-3">Definida pela TI</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowResetNotice(true)}
              aria-expanded={showResetNotice}
              aria-controls="profile-reset-notice"
            >
              <RotateCcwKey aria-hidden size={15} />
              Redefinir senha
            </Button>
          </div>
          <div
            id="profile-reset-notice"
            role="status"
            className="flex items-start gap-2 bg-desk px-6 py-3 text-[13px] text-ink-3"
          >
            {showResetNotice ? (
              <>
                <Info aria-hidden size={14} className="mt-0.5 shrink-0" />
                <span>
                  Esta é uma demonstração: qualquer senha entra, e nenhum link é enviado. Num
                  ambiente real, o link de redefinição iria para {user.email}.
                </span>
              </>
            ) : (
              <>
                <Lock aria-hidden size={14} className="mt-0.5 shrink-0" />
                <span>O link de redefinição vai para {user.email}.</span>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-center sm:gap-4">
      <dt className="text-[13.5px] text-ink-3 sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 text-[14.5px] font-medium text-ink">
        <span className="min-w-0 break-words">{children}</span>
        {note && (
          <span className="flex items-center gap-[5px] text-[12.5px] font-normal text-ink-3">
            <Lock aria-hidden size={13} />
            {note}
          </span>
        )}
      </dd>
    </div>
  );
}
