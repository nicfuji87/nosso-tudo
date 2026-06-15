"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  MessageCircle,
  PartyPopper,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { concluirOnboarding } from "@/app/onboarding/actions";

const TOTAL = 3;

export function OnboardingFlow({ nomeUsuario }: { nomeUsuario: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [aceiteTermos, setAceiteTermos] = useState(false);
  const [aceitePrivacidade, setAceitePrivacidade] = useState(false);
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const primeiroNome = nomeUsuario.split(" ")[0];

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/entrar");
  }

  async function criar() {
    if (nome.trim().length < 2) {
      toast.error("Dê um nome ao seu espaço");
      return;
    }
    setLoading(true);
    const res = await concluirOnboarding({
      nomeWorkspace: nome.trim(),
      aceiteTermos: true,
      aceitePrivacidade: true,
    });
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setStep(2);
  }

  function irParaApp() {
    router.refresh();
    router.push("/app");
  }

  return (
    <div className="atmosphere flex min-h-dvh flex-col">
      <header className="container flex items-center justify-between py-6">
        <Logo />
        <button onClick={sair} className="text-body-sm text-muted-foreground hover:text-foreground">
          Sair
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-lg">
          {/* Progresso */}
          <div className="mb-8 flex items-center justify-center gap-2">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-base",
                  i === step ? "w-8 bg-accent" : i < step ? "w-8 bg-accent/40" : "w-4 bg-border",
                )}
              />
            ))}
          </div>

          <div className="rounded-2xl border border-border/70 bg-card p-8 shadow-card">
            {step === 0 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h1 className="text-h2 font-semibold tracking-tight">
                    Olá, {primeiroNome}! 👋
                  </h1>
                  <p className="text-body-sm text-muted-foreground">
                    Antes de começar, precisamos do seu aceite. Seus dados são seus —
                    isolados e protegidos.
                  </p>
                </div>
                <div className="space-y-3">
                  <CheckRow checked={aceiteTermos} onChange={setAceiteTermos}>
                    Li e aceito os{" "}
                    <Link href="/termos" target="_blank" className="font-medium text-foreground underline-offset-2 hover:underline">
                      Termos de uso
                    </Link>
                  </CheckRow>
                  <CheckRow checked={aceitePrivacidade} onChange={setAceitePrivacidade}>
                    Li e aceito a{" "}
                    <Link href="/privacidade" target="_blank" className="font-medium text-foreground underline-offset-2 hover:underline">
                      Política de Privacidade
                    </Link>{" "}
                    (LGPD)
                  </CheckRow>
                </div>
                <Button
                  className="w-full"
                  disabled={!aceiteTermos || !aceitePrivacidade}
                  onClick={() => setStep(1)}
                >
                  Continuar <ArrowRight className="size-4" />
                </Button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h1 className="text-h2 font-semibold tracking-tight">Crie seu espaço</h1>
                  <p className="text-body-sm text-muted-foreground">
                    É onde a sua família organiza tudo. Você pode mudar o nome depois.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome do espaço</Label>
                  <Input
                    id="nome"
                    autoFocus
                    placeholder="Ex.: Casa dos Fujimoto"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && criar()}
                    maxLength={80}
                  />
                  <p className="text-caption text-muted-foreground">
                    Criaremos categorias padrão e a entidade “Casa” para você.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setStep(0)} disabled={loading}>
                    <ArrowLeft className="size-4" /> Voltar
                  </Button>
                  <Button className="flex-1" onClick={criar} disabled={loading}>
                    {loading && <Loader2 className="size-4 animate-spin" />}
                    Criar meu espaço
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <PartyPopper className="size-7" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-h2 font-semibold tracking-tight">Tudo pronto!</h1>
                  <p className="text-body-sm text-muted-foreground">
                    Seu espaço foi criado. Veja o que dá pra fazer agora:
                  </p>
                </div>
                <div className="space-y-3 text-left">
                  <TutorialRow icon={Wallet} title="Lance sua primeira despesa" desc="Toque no botão “+” para registrar em segundos." />
                  <TutorialRow icon={Sparkles} title="Organize por categorias" desc="Use projetos e compromissos para o que foge do comum." />
                  <TutorialRow icon={MessageCircle} title="Conecte o WhatsApp (Pro)" desc="Depois, capture gastos só mandando uma mensagem." />
                </div>
                <Button className="w-full" onClick={irParaApp}>
                  Ir para o meu espaço <ArrowRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-4 text-left text-body-sm transition-colors",
        checked ? "border-accent bg-accent/10" : "border-border hover:bg-secondary",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          checked ? "border-accent bg-accent text-accent-foreground" : "border-border",
        )}
      >
        {checked && <Check className="size-3.5" />}
      </span>
      <span className="text-muted-foreground [&_a]:text-foreground">{children}</span>
    </button>
  );
}

function TutorialRow({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Wallet;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-secondary/60 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-card text-accent shadow-card">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-body-sm font-medium">{title}</p>
        <p className="text-caption text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
