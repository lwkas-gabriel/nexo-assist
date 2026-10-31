import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "../../ui/Button.tsx";
import { Checkbox } from "../../ui/Checkbox.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { SidePanel } from "../../ui/SidePanel.tsx";
import { TextField } from "../../ui/TextField.tsx";
import { DemoAccounts } from "./DemoAccounts.tsx";
import { LoginShowcase } from "./LoginShowcase.tsx";
import { NexoMark } from "./NexoMark.tsx";
import { useAuth } from "./use-auth.ts";

const SERVICE_DESK_PHONE = "4000";
const FORGOT_HINT_ID = "forgot-password-hint";

/**
 * Tela 1 do protótipo: painel escuro (a partir de 1024 px) e o formulário de entrada. O login
 * aceita qualquer senha, por requisito do desafio; a tela diz isso nas contas de demonstração.
 */
export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotHint, setShowForgotHint] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate({ email, password, remember });
  }

  function pickDemoAccount(demoEmail: string) {
    setEmail(demoEmail);
    passwordRef.current?.focus();
  }

  return (
    <div className="flex min-h-dvh bg-paper">
      <LoginShowcase />

      <div className="flex flex-1 flex-col justify-between gap-10 px-6 py-8 md:px-14 md:py-10">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:justify-end">
          {/* Sem o painel escuro (abaixo de 1024 px), a marca vem para cá. */}
          <div className="flex items-center gap-2 text-ink lg:hidden">
            <NexoMark tone="onLight" />
            <span className="text-[17px] font-bold tracking-[-0.2px] whitespace-nowrap">
              Nexo Assist
            </span>
          </div>
          <p className="text-[13.5px] text-ink-3">
            Problema para entrar?{" "}
            <a
              href={`tel:${SERVICE_DESK_PHONE}`}
              className="font-semibold text-primary-text hover:underline"
            >
              Ligue no ramal {SERVICE_DESK_PHONE}
            </a>
          </p>
        </header>

        <main className="flex justify-center">
          <div className="flex w-full max-w-[380px] flex-col gap-7">
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-[40px] leading-[1.1] tracking-[-0.8px] text-ink">
                Entrar
              </h1>
              <p className="text-[15.5px] text-ink-3">
                Use seu e-mail corporativo e a senha da rede Nexo.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-7">
              <div className="flex flex-col gap-[18px]">
                <TextField
                  label="E-mail corporativo"
                  type="email"
                  autoComplete="username"
                  placeholder="nome.sobrenome@nexo.com.br"
                  icon={<Mail size={16} />}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <div className="flex flex-col gap-1.5">
                  <TextField
                    ref={passwordRef}
                    label="Senha"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    icon={<LockKeyhole size={16} />}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    labelAside={
                      <button
                        type="button"
                        aria-expanded={showForgotHint}
                        aria-controls={FORGOT_HINT_ID}
                        onClick={() => setShowForgotHint((shown) => !shown)}
                        className="text-[13.5px] font-medium text-primary-text hover:underline"
                      >
                        Esqueci minha senha
                      </button>
                    }
                    trailing={
                      <IconButton
                        label="Mostrar os caracteres"
                        aria-pressed={showPassword}
                        icon={showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        onClick={() => setShowPassword((shown) => !shown)}
                        className="size-[30px] rounded-sm"
                      />
                    }
                  />
                  {/* Sempre presente e anunciada: o texto aparece quando o botão abre a dica. */}
                  <p id={FORGOT_HINT_ID} aria-live="polite" className="text-xs text-ink-3">
                    {showForgotHint && "Nesta demonstração, qualquer senha entra."}
                  </p>
                </div>
                <Checkbox
                  label="Manter conectado neste computador"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
              </div>

              {login.error && (
                <p role="alert" className="text-[13.5px] text-danger-text">
                  {login.error.message}
                </p>
              )}

              <Button type="submit" size="lg" disabled={login.isPending} className="w-full">
                {login.isPending ? "Entrando…" : "Entrar"}
                {!login.isPending && <ArrowRight size={16} aria-hidden />}
              </Button>
            </form>

            <DemoAccounts onPick={pickDemoAccount} />
          </div>
        </main>

        <footer className="flex flex-wrap justify-between gap-2 text-[12.5px] text-ink-3">
          <span>© 2026 Nexo · Service desk de TI</span>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setPrivacyOpen(true)}
            className="hover:underline"
          >
            Privacidade e uso de dados
          </button>
        </footer>
      </div>

      {/* Sempre sobreposto: no desktop, uma terceira coluna esmagaria o formulário. */}
      <SidePanel
        title="Privacidade e uso de dados"
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        inlineFrom="never"
        widthClass="w-[420px]"
      >
        <PrivacyNote />
      </SidePanel>
    </div>
  );
}

/** O que acontece com os dados nesta demonstração, em linguagem simples. */
function PrivacyNote() {
  return (
    <div className="flex flex-col gap-3 text-[13.5px] text-ink-2">
      <p>
        Esta é uma demonstração. As pessoas e os chamados são fictícios, e a base volta ao estado
        inicial quando o serviço é publicado de novo.
      </p>
      <p>
        As conversas ficam guardadas para o atendimento continuar de onde parou e para o analista
        entender o caso. Cada funcionário só vê as próprias conversas e os próprios chamados.
      </p>
      <p>
        As mensagens são enviadas a um modelo de IA (Gemini, do Google) para gerar as respostas. No
        plano gratuito usado aqui, o Google pode usar esse conteúdo para melhorar os produtos dele.
        Não escreva senhas nem dados pessoais de verdade.
      </p>
    </div>
  );
}
