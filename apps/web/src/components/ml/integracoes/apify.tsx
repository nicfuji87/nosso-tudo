"use client";

import { useState } from "react";
import { Bot, Info, Trash2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Campo, Textarea } from "@/components/ml/campos";
import { desconectarIntegracao, salvarApify, testarIntegracao } from "@/app/ml/(painel)/integracoes/actions";
import { CartaoIntegracao, Nota } from "./cartao-integracao";
import { CampoSegredo, Recolhivel, SoLeitura, useAcao } from "./comum";
import { cfgTexto, type IntegracaoView, type Permissoes } from "./tipos";

const ACTOR_PADRAO = "karamelo~mercadolivre-scraper-brasil-portugues";
const TEMPLATE_PADRAO = '{"keyword": "{{titulo}}", "maxPages": 1}';

/** O template precisa virar JSON válido depois de trocar os marcadores. */
function erroTemplate(t: string): string | null {
  if (!t.trim()) return null;
  try {
    const v: unknown = JSON.parse(t.replace(/\{\{\s*\w+\s*\}\}/g, "x"));
    if (!v || typeof v !== "object" || Array.isArray(v)) return "O modelo precisa ser um objeto JSON, entre { }.";
    return null;
  } catch {
    return "JSON inválido. Confira aspas, vírgulas e chaves (os marcadores ficam dentro de aspas).";
  }
}

export function IntegracaoApify({ integ, tz, permissoes }: { integ: IntegracaoView; tz: string; permissoes: Permissoes }) {
  const mascara = integ.secret_hints.token ?? null;
  const actorSalvo = cfgTexto(integ.config, "actor_id");
  const templateSalvo = cfgTexto(integ.config, "input_template");

  const [token, setToken] = useState("");
  const [actor, setActor] = useState(actorSalvo);
  const [template, setTemplate] = useState(templateSalvo || TEMPLATE_PADRAO);
  const { pendente, executar } = useAcao();

  const actorEfetivo = actor.trim() || ACTOR_PADRAO;
  const actorValido = /^[\w.-]+[~/][\w.-]+$|^\w{10,30}$/.test(actorEfetivo);
  const tokenValido = token.trim() === "" ? Boolean(mascara) : token.trim().length >= 10;
  const errTpl = erroTemplate(template);
  const mudou = token.trim() !== "" || actorEfetivo !== (actorSalvo || ACTOR_PADRAO) || template.trim() !== (templateSalvo || TEMPLATE_PADRAO);

  return (
    <CartaoIntegracao
      integ={integ}
      tz={tz}
      titulo="Apify"
      descricao="Complemento: busca avaliações e vendas quando o Mercado Livre não informa."
      icone={<Bot className="size-5" />}
      opcional
      rotulos={{ disconnected: "Sem token", connected: "Token válido", invalid: "Token inválido" }}
    >
      <Nota icone={<Info />}>
        <p>
          O Apify só <strong>preenche lacunas</strong> (nota e quantidade vendida). O app <strong>nunca depende</strong> dele: sem Apify, tudo funciona com
          os dados oficiais do Mercado Livre.
        </p>
        <p className="text-muted-foreground">Os “actors” são robôs feitos por terceiros e podem mudar ou parar sem aviso — por isso ficam opcionais.</p>
      </Nota>

      {permissoes.administrar ? (
        <form
          className="space-y-3"
          autoComplete="off"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!tokenValido || !actorValido || errTpl) return;
            const ok = await executar(() =>
              salvarApify({ token: token.trim() || undefined, actorId: actorEfetivo, inputTemplate: template.trim() || TEMPLATE_PADRAO }),
            );
            if (ok) setToken("");
          }}
        >
          <Campo
            label="Token da API"
            dica={
              <>
                Em{" "}
                <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noopener noreferrer" className="text-tech underline-offset-4 hover:underline">
                  console.apify.com › Settings › Integrations
                </a>
                .
              </>
            }
          >
            <CampoSegredo mascara={mascara} value={token} onChange={(e) => setToken(e.target.value)} placeholder="apify_api_…" disabled={pendente} />
          </Campo>

          <Recolhivel titulo="Ajustes avançados (actor e modelo de entrada)">
            <div className="space-y-3">
              <Campo label="Actor" dica={actorValido ? `Formato usuario~nome-do-actor. Vazio = ${ACTOR_PADRAO}.` : "Use usuario~nome-do-actor ou o ID do actor."}>
                <Input
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  placeholder={ACTOR_PADRAO}
                  spellCheck={false}
                  aria-invalid={!actorValido}
                  disabled={pendente}
                />
              </Campo>
              <Campo
                label="Modelo de entrada (JSON)"
                dica={
                  errTpl ?? (
                    <>
                      Marcadores disponíveis: <code>{"{{titulo}}"}</code>, <code>{"{{url}}"}</code>, <code>{"{{id}}"}</code> — substituídos pelos dados do produto.
                    </>
                  )
                }
              >
                <Textarea
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  className="font-mono text-caption"
                  aria-invalid={Boolean(errTpl)}
                  disabled={pendente}
                />
              </Campo>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setActor(""); setTemplate(TEMPLATE_PADRAO); }} disabled={pendente}>
                Voltar ao padrão
              </Button>
            </div>
          </Recolhivel>

          <Button type="submit" size="sm" disabled={pendente || !mudou || !tokenValido || !actorValido || Boolean(errTpl)}>
            Salvar Apify
          </Button>
        </form>
      ) : (
        <>
          <p className="text-body-sm text-muted-foreground">Actor: {actorSalvo || ACTOR_PADRAO}</p>
          <SoLeitura />
        </>
      )}

      {(permissoes.operar || permissoes.administrar) && integ.status !== "disconnected" && (
        <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
          {permissoes.operar && (
            <AcaoBotao size="sm" variant="secondary" acao={() => testarIntegracao("apify")}>
              <Wifi /> Testar token e actor
            </AcaoBotao>
          )}
          {permissoes.administrar && (
            <AcaoBotao
              size="sm"
              variant="ghost"
              className="text-destructive"
              acao={() => desconectarIntegracao("apify")}
              confirmar="Remover o token do Apify? O app segue funcionando só com os dados do Mercado Livre."
            >
              <Trash2 /> Remover
            </AcaoBotao>
          )}
        </div>
      )}
    </CartaoIntegracao>
  );
}
