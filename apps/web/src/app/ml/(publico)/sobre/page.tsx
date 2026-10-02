import type { Metadata } from "next";
import Link from "next/link";
import { CONTATO_EMAIL } from "../contato";

export const metadata: Metadata = {
  title: "Sobre",
  description: "O que é a Casa Prática, para que serve e como usa a Pinterest API.",
};

const USOS_API = [
  {
    escopo: "user_accounts:read",
    uso: "Identificar a conta conectada (ID, nome de usuário e tipo de conta) para confirmar que a conexão está ativa.",
  },
  {
    escopo: "boards:read",
    uso: "Listar as pastas (boards) da própria conta para escolher onde cada Pin será publicado.",
  },
  {
    escopo: "boards:write",
    uso: "Criar uma nova pasta na própria conta quando o operador pedir, para organizar os Pins por tema.",
  },
  {
    escopo: "pins:write",
    uso: "Publicar os Pins aprovados (imagem, título, descrição, texto alternativo e link) na pasta escolhida.",
  },
  {
    escopo: "pins:read",
    uso: "Conferir Pins recentes da pasta para não publicar o mesmo Pin duas vezes e ler as métricas dos Pins publicados pela própria conta.",
  },
];

export default function SobrePage() {
  return (
    <article className="container max-w-3xl py-16 lg:py-20">
      <p className="text-overline uppercase tracking-wide text-accent">Sobre a aplicação</p>
      <h1 className="mt-3 text-h1 font-semibold tracking-tight">Casa Prática</h1>
      <p className="mt-4 text-body-lg text-muted-foreground">
        A Casa Prática faz curadoria de produtos úteis para a casa e os compartilha no Pinterest em forma de Pins
        com inspiração, dicas de uso e link para a página do produto.
      </p>

      <div className="mt-12 space-y-10 text-body text-muted-foreground [&_h2]:text-h4 [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground">
        <section className="space-y-3">
          <h2>Finalidade</h2>
          <p>
            A Casa Prática é uma ferramenta de uso próprio, operada por uma equipe pequena, para publicar conteúdo na
            conta do Pinterest da própria Casa Prática. Ela não é oferecida ao público e não acessa contas de outras
            pessoas.
          </p>
          <p>O fluxo de trabalho é:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>selecionar produtos para a casa disponíveis no Mercado Livre;</li>
            <li>
              preparar o criativo de cada Pin — imagem, título, descrição e texto alternativo — às vezes com apoio de
              inteligência artificial, sempre sinalizado como tal quando o Pinterest permite;
            </li>
            <li>validar o conteúdo e, conforme a configuração, submetê-lo à aprovação manual de um operador;</li>
            <li>publicar o Pin na pasta adequada e acompanhar o desempenho dele ao longo do tempo.</li>
          </ol>
          <p>
            Os Pins levam à página do produto no Mercado Livre por meio de links de afiliado: a Casa Prática pode
            receber uma comissão quando alguém compra a partir deles, sem custo adicional para quem compra.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Como usamos a Pinterest API</h2>
          <p>
            A conexão é feita pelo fluxo oficial de autorização (OAuth) do Pinterest, iniciado pelo próprio dono da
            conta. Solicitamos apenas as permissões necessárias para o fluxo acima:
          </p>
          <ul className="divide-y divide-border/70 rounded-xl border border-border/70 bg-card">
            {USOS_API.map((u) => (
              <li key={u.escopo} className="space-y-1 px-5 py-4">
                <code className="font-mono text-body-sm font-medium text-foreground">{u.escopo}</code>
                <p className="text-body-sm">{u.uso}</p>
              </li>
            ))}
          </ul>
          <p>
            Também consultamos, para os Pins publicados pela própria conta, métricas agregadas de desempenho
            (impressões, salvamentos, cliques no Pin e cliques de saída). Isso orienta quais temas e formatos de
            conteúdo funcionam melhor.
          </p>
          <p>
            Não lemos seguidores, mensagens, comentários nem Pins de outras pessoas, não publicamos em contas de
            terceiros e não vendemos nem compartilhamos dados obtidos do Pinterest. A aplicação respeita os{" "}
            <a
              href="https://policy.pinterest.com/developer-guidelines"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Developer Guidelines do Pinterest
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2>Privacidade e contato</h2>
          <p>
            Os detalhes sobre quais dados são acessados, onde ficam guardados, por quanto tempo e como pedir a exclusão
            estão na{" "}
            <Link href="/ml/privacidade" className="font-medium text-foreground underline-offset-2 hover:underline">
              Política de Privacidade
            </Link>
            . Dúvidas, sugestões ou denúncias sobre algum Pin podem ser enviadas para{" "}
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
