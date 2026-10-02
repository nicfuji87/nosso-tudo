import type { Metadata } from "next";
import Link from "next/link";
import { CONTATO_EMAIL, POLITICA_VIGENCIA } from "../contato";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Quais dados do Pinterest a Casa Prática acessa, para quê, onde guarda, por quanto tempo e como pedir a exclusão.",
};

const DADOS = [
  {
    dado: "Identificação da conta",
    detalhe: "ID da conta, nome de usuário, nome comercial e tipo de conta (pessoal ou empresarial).",
    finalidade: "Confirmar qual conta está conectada e se a conexão segue válida.",
  },
  {
    dado: "Tokens de acesso",
    detalhe: "Token de acesso e token de renovação emitidos pelo Pinterest, com datas de expiração e permissões concedidas.",
    finalidade: "Fazer as chamadas autorizadas à API em nome da própria conta.",
  },
  {
    dado: "Pastas (boards)",
    detalhe: "ID, nome, descrição, visibilidade, quantidade de Pins, quantidade de seguidores e imagem de capa das pastas da conta.",
    finalidade: "Escolher em qual pasta cada Pin será publicado.",
  },
  {
    dado: "Pins publicados",
    detalhe:
      "ID, endereço e data de publicação dos Pins criados pela Casa Prática. Os Pins recentes da pasta são apenas consultados, sem serem armazenados.",
    finalidade: "Registrar o que foi publicado e evitar publicações duplicadas.",
  },
  {
    dado: "Métricas dos Pins",
    detalhe: "Totais diários de impressões, salvamentos, cliques no Pin e cliques de saída dos Pins da própria conta.",
    finalidade: "Medir o desempenho do conteúdo e decidir o que publicar a seguir.",
  },
];

const RETENCAO = [
  ["Tokens de acesso", "Até a desconexão ou a revogação do acesso; apagados imediatamente ao desconectar."],
  ["Identificação da conta", "Até a desconexão; removida junto com os tokens."],
  ["Pastas, Pins publicados e métricas", "Enquanto a integração estiver em uso, para manter o histórico de desempenho; excluídos mediante solicitação ou em até 30 dias após o encerramento da aplicação."],
  ["Registros técnicos de chamadas à API", "30 dias; apagados automaticamente por uma rotina semanal."],
  ["Estado temporário da autorização (OAuth)", "15 minutos; descartado após o uso ou a expiração."],
];

export default function PrivacidadeMlPage() {
  return (
    <article className="container max-w-3xl py-16 lg:py-20">
      <p className="text-overline uppercase tracking-wide text-accent">Integração com o Pinterest</p>
      <h1 className="mt-3 text-h1 font-semibold tracking-tight">Política de Privacidade</h1>
      <p className="mt-2 text-body-sm text-muted-foreground">Vigente desde {POLITICA_VIGENCIA}</p>

      <div className="mt-10 space-y-10 text-body text-muted-foreground [&_h2]:text-h4 [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground">
        <section className="space-y-3">
          <h2>1. A quem esta política se aplica</h2>
          <p>
            Esta política descreve como a{" "}
            <Link href="/ml/sobre" className="font-medium text-foreground underline-offset-2 hover:underline">
              Casa Prática
            </Link>{" "}
            trata os dados obtidos pela Pinterest API. A Casa Prática é uma ferramenta de uso próprio que publica
            conteúdo na conta do Pinterest da própria Casa Prática; somente o dono dessa conta a conecta, pelo fluxo
            oficial de autorização (OAuth) do Pinterest. Não acessamos contas de outras pessoas.
          </p>
          <p>
            O tratamento segue a Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e os Developer Guidelines do
            Pinterest.
          </p>
        </section>

        <section className="space-y-3">
          <h2>2. Quais dados do Pinterest acessamos e para quê</h2>
          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
            <table className="w-full min-w-[34rem] text-left text-body-sm">
              <thead className="border-b border-border/70 text-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Dado</th>
                  <th className="px-4 py-3 font-semibold">O que inclui</th>
                  <th className="px-4 py-3 font-semibold">Finalidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70 align-top">
                {DADOS.map((d) => (
                  <tr key={d.dado}>
                    <td className="px-4 py-3 font-medium text-foreground">{d.dado}</td>
                    <td className="px-4 py-3">{d.detalhe}</td>
                    <td className="px-4 py-3">{d.finalidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <strong className="font-semibold text-foreground">Não acessamos</strong> seguidores, listas de quem segue a
            conta, mensagens, comentários, Pins de outras pessoas, dados de anúncios nem informações de pagamento. As
            métricas são números agregados fornecidos pelo Pinterest e não identificam quem viu ou clicou nos Pins.
          </p>
          <p>
            Os dados do Pinterest são usados exclusivamente para operar a Casa Prática. Não os vendemos, não os
            compartilhamos com terceiros para publicidade e não os usamos para treinar modelos de inteligência
            artificial.
          </p>
        </section>

        <section className="space-y-3">
          <h2>3. Onde os dados são armazenados</h2>
          <p>
            Os dados ficam em um banco de dados PostgreSQL gerenciado pelo{" "}
            <span className="font-medium text-foreground">Supabase</span>. Os tokens de acesso são guardados
            separadamente, no cofre criptografado do Supabase (Supabase Vault), e nunca em texto aberto nas tabelas da
            aplicação. A aplicação roda na <span className="font-medium text-foreground">Vercel</span>, que processa as
            requisições sem armazenar esses dados de forma permanente.
          </p>
        </section>

        <section className="space-y-3">
          <h2>4. Como os dados são protegidos</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>toda comunicação com o Pinterest e com o banco de dados é criptografada em trânsito (HTTPS/TLS);</li>
            <li>os dados ficam criptografados em repouso, e os tokens contam com uma camada adicional de criptografia no cofre;</li>
            <li>
              os tokens só são lidos no servidor, no momento de cada chamada à API — nunca são enviados ao navegador
              nem exibidos na interface;
            </li>
            <li>
              o painel de operação exige login e é restrito a membros autorizados, com controle de acesso por papel e
              regras de segurança em nível de linha (Row Level Security) no banco;
            </li>
            <li>os registros técnicos têm tokens, cabeçalhos de autorização e outras credenciais removidos automaticamente;</li>
            <li>ações administrativas sensíveis ficam registradas em trilha de auditoria.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2>5. Por quanto tempo guardamos</h2>
          <dl className="divide-y divide-border/70 rounded-xl border border-border/70 bg-card">
            {RETENCAO.map(([dado, prazo]) => (
              <div key={dado} className="grid gap-1 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:gap-4">
                <dt className="font-medium text-foreground">{dado}</dt>
                <dd className="text-body-sm">{prazo}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-3">
          <h2>6. Como revogar o acesso e pedir a exclusão</h2>
          <p>Você pode, a qualquer momento:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="font-semibold text-foreground">Revogar o acesso no Pinterest</strong>, removendo a
              Casa Prática dos aplicativos conectados nas configurações de segurança da sua conta do Pinterest. Os
              tokens deixam de funcionar imediatamente e nenhuma nova chamada à API é possível.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Pedir a exclusão dos dados</strong> por e-mail para{" "}
              <a href={`mailto:${CONTATO_EMAIL}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                {CONTATO_EMAIL}
              </a>
              , com o assunto “Exclusão de dados do Pinterest” e o nome de usuário da conta. Respondemos em até 15 dias
              e concluímos a exclusão de tokens, identificação da conta, pastas, registros de Pins e métricas em até 30
              dias, com confirmação por e-mail.
            </li>
          </ul>
          <p>
            Os Pins já publicados ficam na sua conta do Pinterest e podem ser apagados diretamente por você no
            Pinterest. Pelo mesmo canal você também pode pedir acesso, correção ou portabilidade dos dados, conforme a
            LGPD.
          </p>
        </section>

        <section className="space-y-3">
          <h2>7. Alterações nesta política</h2>
          <p>
            Se mudarmos a forma de tratar os dados do Pinterest, esta página será atualizada e a data de vigência no
            topo será alterada antes de a mudança entrar em vigor.
          </p>
        </section>

        <section id="contato" className="scroll-mt-24 space-y-3">
          <h2>8. Contato</h2>
          <p>
            Para dúvidas sobre esta política ou sobre o tratamento de dados, escreva para{" "}
            <a href={`mailto:${CONTATO_EMAIL}`} className="font-medium text-foreground underline-offset-2 hover:underline">
              {CONTATO_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
