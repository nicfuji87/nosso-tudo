import type { Metadata } from "next";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacidadePage() {
  return (
    <article className="container max-w-3xl py-16 lg:py-24">
      <p className="text-overline uppercase tracking-wide text-accent">Legal · LGPD</p>
      <h1 className="mt-3 text-h1 font-semibold tracking-tight">Política de Privacidade</h1>
      <p className="mt-2 text-body-sm text-muted-foreground">Versão 1.0 · vigente desde junho de 2026</p>

      <div className="mt-10 space-y-8 text-body text-muted-foreground [&_h2]:text-h4 [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground">
        <section className="space-y-2">
          <h2>1. Seus dados são seus</h2>
          <p>
            Tratamos seus dados conforme a LGPD. As informações financeiras da sua família
            ficam isoladas por workspace e acessíveis apenas a quem você autorizar.
          </p>
        </section>
        <section className="space-y-2">
          <h2>2. O que coletamos</h2>
          <p>
            Dados de cadastro (nome, e-mail), os lançamentos que você registra e metadados
            técnicos mínimos para segurança. Não armazenamos dados de cartão — pagamentos
            são tokenizados pelo Asaas.
          </p>
        </section>
        <section className="space-y-2">
          <h2>3. Segurança</h2>
          <p>
            Criptografia em trânsito e repouso, isolamento por Row Level Security e
            auditoria de acessos sensíveis. Segurança é fundação, não opcional.
          </p>
        </section>
        <section className="space-y-2">
          <h2>4. Seus direitos</h2>
          <p>
            Você pode acessar, corrigir, exportar e excluir seus dados a qualquer momento
            nas configurações da conta. A exclusão tem período de arrependimento de 30 dias.
          </p>
        </section>
        <section id="dpo" className="space-y-2 scroll-mt-24">
          <h2>5. Encarregado de Dados (DPO)</h2>
          <p>
            Para dúvidas sobre privacidade e exercício de direitos, fale com nosso DPO pelo
            e-mail <span className="font-medium text-foreground">privacidade@nossotudo.app</span>.
          </p>
        </section>
      </div>
    </article>
  );
}
