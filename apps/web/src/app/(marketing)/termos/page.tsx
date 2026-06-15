import type { Metadata } from "next";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function TermosPage() {
  return (
    <article className="container max-w-3xl py-16 lg:py-24">
      <p className="text-overline uppercase tracking-wide text-accent">Legal</p>
      <h1 className="mt-3 text-h1 font-semibold tracking-tight">Termos de Uso</h1>
      <p className="mt-2 text-body-sm text-muted-foreground">Versão 1.0 · vigente desde junho de 2026</p>

      <div className="mt-10 space-y-8 text-body text-muted-foreground [&_h2]:text-h4 [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground">
        <section className="space-y-2">
          <h2>1. Aceitação</h2>
          <p>
            Ao criar uma conta no Nosso Tudo, você concorda com estes Termos e com a
            nossa Política de Privacidade. Caso não concorde, não utilize o serviço.
          </p>
        </section>
        <section className="space-y-2">
          <h2>2. O serviço</h2>
          <p>
            O Nosso Tudo é uma plataforma de organização financeira familiar. Oferecemos
            planos gratuito e pago (Pro), com recursos descritos na página de preços.
          </p>
        </section>
        <section className="space-y-2">
          <h2>3. Sua conta</h2>
          <p>
            Você é responsável por manter a confidencialidade das suas credenciais e por
            toda atividade na sua conta. Recomendamos ativar a verificação em duas etapas.
          </p>
        </section>
        <section className="space-y-2">
          <h2>4. Planos e cobrança</h2>
          <p>
            O plano Pro é cobrado via Asaas (Pix, Boleto ou Cartão). O cancelamento pode
            ser feito a qualquer momento e mantém o acesso até o fim do período pago.
          </p>
        </section>
        <section className="space-y-2">
          <h2>5. Alterações</h2>
          <p>
            Podemos atualizar estes Termos. Mudanças relevantes exigirão novo aceite. A
            versão vigente estará sempre disponível nesta página.
          </p>
        </section>
      </div>
    </article>
  );
}
