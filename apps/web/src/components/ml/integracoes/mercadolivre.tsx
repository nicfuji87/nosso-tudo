"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Link2, Lock, PlugZap, ShoppingBag, Unplug, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Campo } from "@/components/ml/campos";
import { desconectarIntegracao, salvarAppMercadoLivre, testarIntegracao } from "@/app/ml/(painel)/integracoes/actions";
import { CartaoIntegracao, Nota, Passo } from "./cartao-integracao";
import { CampoSegredo, CopiarTexto, Recolhivel, SoLeitura, useAcao } from "./comum";
import { cfgTexto, jaVinculado, type IntegracaoView, type Permissoes } from "./tipos";

export function IntegracaoMercadoLivre({
  integ,
  tz,
  redirectUri,
  permissoes,
}: {
  integ: IntegracaoView;
  tz: string;
  redirectUri: string;
  permissoes: Permissoes;
}) {
  const clientIdSalvo = cfgTexto(integ.config, "client_id");
  const mascaraSecret = integ.secret_hints.client_secret ?? null;
  const temApp = Boolean(clientIdSalvo && mascaraSecret);
  const vinculado = jaVinculado(integ.status);
  const https = redirectUri.startsWith("https://");

  const [clientId, setClientId] = useState(clientIdSalvo);
  const [secret, setSecret] = useState("");
  const { pendente, executar } = useAcao();

  const idValido = /^\d{4,25}$/.test(clientId.trim());
  const secretValido = secret.trim() === "" ? Boolean(mascaraSecret) : secret.trim().length >= 8;
  const mudou = clientId.trim() !== clientIdSalvo || secret.trim() !== "";

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idValido || !secretValido) return;
    const ok = await executar(() => salvarAppMercadoLivre(clientId.trim(), secret.trim() || undefined));
    if (ok) setSecret("");
  };

  const guia = (
    <ol className="space-y-5">
      <Passo numero={1} titulo="Crie um app no DevCenter do Mercado Livre" feito={temApp}>
        <p className="text-body-sm text-muted-foreground">
          Entre com a sua conta do Mercado Livre, clique em <strong>Criar aplicação</strong> e, no campo <strong>URI de redirect</strong>, cole
          exatamente o endereço abaixo.
        </p>
        <Button asChild size="sm" variant="secondary">
          <a href="https://developers.mercadolivre.com.br/devcenter" target="_blank" rel="noopener noreferrer">
            Abrir DevCenter <ExternalLink />
          </a>
        </Button>
        <CopiarTexto valor={redirectUri} rotulo="Redirect URI do Mercado Livre" />
        {https ? (
          <p className="text-caption text-muted-foreground">
            O Mercado Livre só aceita endereços <strong>https</strong> e idênticos ao cadastrado — por isso a conexão funciona apenas no site publicado.
          </p>
        ) : (
          <Nota tom="aviso" icone={<Lock />}>
            <p>
              Você está abrindo o painel por um endereço sem <strong>https</strong> (ambiente local). O Mercado Livre recusa esse endereço: faça a conexão
              pelo site publicado.
            </p>
          </Nota>
        )}
      </Passo>

      <Passo numero={2} titulo="Copie o App ID e a Secret Key do app" feito={temApp}>
        {permissoes.administrar ? (
          <form onSubmit={salvar} className="space-y-3" autoComplete="off">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="App ID" dica={clientId && !idValido ? "O App ID tem só números." : "Número que aparece no topo do app."}>
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  inputMode="numeric"
                  placeholder="Ex.: 1234567890123456"
                  aria-invalid={Boolean(clientId) && !idValido}
                  disabled={pendente}
                />
              </Campo>
              <Campo label="Secret Key">
                <CampoSegredo
                  mascara={mascaraSecret}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Cole a Secret Key"
                  aria-invalid={secret.trim() !== "" && !secretValido}
                  disabled={pendente}
                />
              </Campo>
            </div>
            <Button type="submit" size="sm" disabled={pendente || !idValido || !secretValido || !mudou}>
              Salvar credenciais
            </Button>
          </form>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            {temApp ? `App configurado (App ID ${clientIdSalvo}, Secret Key ${mascaraSecret}).` : "Ainda não configurado."}
          </p>
        )}
      </Passo>

      <Passo numero={3} titulo={vinculado ? "Reconecte quando precisar" : "Conecte a sua conta"} feito={integ.status === "connected"}>
        <p className="text-body-sm text-muted-foreground">
          Você será levado ao Mercado Livre para autorizar o acesso e voltará para cá automaticamente.
        </p>
        {permissoes.administrar &&
          (temApp ? (
            <Button asChild variant="tech" size="sm">
              <a href="/api/ml/oauth/mercadolivre/start">
                <PlugZap /> {vinculado ? "Reconectar Mercado Livre" : "Conectar Mercado Livre"}
              </a>
            </Button>
          ) : (
            <Button variant="tech" size="sm" disabled title="Salve o App ID e a Secret Key primeiro">
              <PlugZap /> Conectar Mercado Livre
            </Button>
          ))}
      </Passo>
    </ol>
  );

  return (
    <CartaoIntegracao
      integ={integ}
      tz={tz}
      titulo="Mercado Livre"
      descricao="Busca categorias, mais vendidos, tendências e confere preço/estoque antes de publicar."
      icone={<ShoppingBag className="size-5" />}
      mostrarTokens
    >
      {permissoes.administrar && (vinculado ? <Recolhivel titulo="Configuração do app (passo a passo)">{guia}</Recolhivel> : guia)}

      <Nota icone={<Link2 />}>
        <p>
          <strong>Links de afiliado são gerados por você.</strong> O Mercado Livre não oferece API para isso. O app separa os produtos aprovados numa fila:
          você abre o produto, gera o link no painel de afiliados e cola — leva uns 10 segundos por produto.
        </p>
        <Link href="/ml/pendencias" className="text-caption font-medium text-tech underline-offset-4 hover:underline">
          Ver a fila de links pendentes
        </Link>
      </Nota>

      {!permissoes.administrar && <SoLeitura />}

      {(permissoes.operar || permissoes.administrar) && vinculado && (
        <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
          {permissoes.operar && (
            <AcaoBotao size="sm" variant="secondary" acao={() => testarIntegracao("mercadolivre")}>
              <Wifi /> Testar conexão
            </AcaoBotao>
          )}
          {permissoes.administrar && (
            <AcaoBotao
              size="sm"
              variant="ghost"
              className="text-destructive"
              acao={() => desconectarIntegracao("mercadolivre")}
              confirmar="Desconectar o Mercado Livre? A descoberta e as checagens de preço param até você conectar de novo. O App ID e a Secret Key continuam salvos."
            >
              <Unplug /> Desconectar
            </AcaoBotao>
          )}
        </div>
      )}
    </CartaoIntegracao>
  );
}
