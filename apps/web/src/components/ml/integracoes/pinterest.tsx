"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, ExternalLink, FlaskConical, KeyRound, LayoutGrid, Pin, PlugZap, Plus, RefreshCw, Unplug, Wifi, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Campo, NativeSelect, Textarea } from "@/components/ml/campos";
import { JobStatus } from "@/components/ml/job-status";
import {
  criarBoard,
  desconectarIntegracao,
  salvarAppPinterest,
  salvarTokenPinterest,
  sincronizarBoardsAgora,
  testarPinSandbox,
  testarIntegracao,
} from "@/app/ml/(painel)/integracoes/actions";
import { CartaoIntegracao, Nota, Passo } from "./cartao-integracao";
import { CampoSegredo, CopiarTexto, Recolhivel, SoLeitura, useAcao } from "./comum";
import { cfgTexto, jaVinculado, type IntegracaoView, type Permissoes } from "./tipos";

/** Escopos que o app pede no OAuth (espelho de `ESCOPOS` do adaptador). */
const ESCOPOS_NECESSARIOS = [
  { escopo: "boards:read", label: "Ler boards" },
  { escopo: "boards:write", label: "Criar boards" },
  { escopo: "pins:read", label: "Ler Pins" },
  { escopo: "pins:write", label: "Publicar Pins" },
  { escopo: "user_accounts:read", label: "Ler a conta e métricas" },
];

type Ambiente = "production" | "sandbox";

function SeletorAmbiente({ valor, onChange, disabled, id }: { valor: Ambiente; onChange: (a: Ambiente) => void; disabled?: boolean; id?: string }) {
  return (
    <NativeSelect id={id} value={valor} onChange={(e) => onChange(e.target.value as Ambiente)} disabled={disabled} className="w-full">
      <option value="production">Produção (Pins públicos)</option>
      <option value="sandbox">Sandbox (teste — Pins visíveis só para você)</option>
    </NativeSelect>
  );
}

function ExplicacaoAmbiente() {
  return (
    <Nota icone={<FlaskConical />}>
      <p>
        <strong>Produção ou Sandbox?</strong> Todo app novo do Pinterest começa em <em>Trial</em>, e apps em Trial só publicam no <strong>sandbox</strong>:
        os Pins ficam visíveis só para você e o sandbox <strong>não tem métricas</strong> (cliques, salvamentos).
      </p>
      <p>
        Para publicar de verdade, peça o acesso <strong>Standard</strong> no portal do Pinterest e depois troque para Produção aqui.
      </p>
    </Nota>
  );
}

function DialogoCriarBoard({ aberto, onOpenChange }: { aberto: boolean; onOpenChange: (v: boolean) => void }) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const { pendente, executar } = useAcao();
  const valido = nome.trim().length >= 2 && nome.trim().length <= 180;
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar board no Pinterest</DialogTitle>
          <DialogDescription>O board é criado como público na sua conta e aparece aqui após a sincronização.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valido) return;
            const ok = await executar(() => criarBoard(nome.trim(), descricao.trim() || undefined));
            if (ok) {
              setNome("");
              setDescricao("");
              onOpenChange(false);
            }
          }}
        >
          <Campo label="Nome do board" dica="Ex.: Achados de cozinha, Decoração de quarto">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={180} autoFocus disabled={pendente} />
          </Campo>
          <Campo label="Descrição (opcional)" dica="Ajuda o Pinterest a entender o assunto do board.">
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} rows={3} disabled={pendente} />
          </Campo>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" variant="tech" disabled={!valido || pendente}>
              Criar board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IntegracaoPinterest({
  integ,
  tz,
  redirectUri,
  permissoes,
  boardsAtivos,
  boardTesteId = null,
}: {
  integ: IntegracaoView;
  tz: string;
  redirectUri: string;
  permissoes: Permissoes;
  boardsAtivos: number;
  boardTesteId?: string | null;
}) {
  const clientIdSalvo = cfgTexto(integ.config, "client_id");
  const ambienteSalvo: Ambiente = cfgTexto(integ.config, "environment") === "sandbox" ? "sandbox" : "production";
  const mascaraSecret = integ.secret_hints.client_secret ?? null;
  const temApp = Boolean(clientIdSalvo && mascaraSecret);
  const vinculado = jaVinculado(integ.status);
  const conectado = integ.status === "connected" || integ.status === "expiring" || integ.status === "insufficient_scope";

  const [clientId, setClientId] = useState(clientIdSalvo);
  const [secret, setSecret] = useState("");
  const [ambiente, setAmbiente] = useState<Ambiente>(ambienteSalvo);
  const [token, setToken] = useState("");
  const [ambienteToken, setAmbienteToken] = useState<Ambiente>("sandbox");
  const [jobBoards, setJobBoards] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const app = useAcao();
  const tok = useAcao();

  const idValido = /^\d{4,25}$/.test(clientId.trim());
  const secretValido = secret.trim() === "" ? Boolean(mascaraSecret) : secret.trim().length >= 8;
  const mudou = clientId.trim() !== clientIdSalvo || secret.trim() !== "" || ambiente !== ambienteSalvo;
  const tokenValido = token.trim().length >= 20 && token.trim().length <= 400;

  const concedidos = new Set(integ.scopes);
  const faltando = ESCOPOS_NECESSARIOS.filter((e) => !concedidos.has(e.escopo));

  const guia = (
    <ol className="space-y-5">
      <Passo numero={1} titulo="Crie um app no portal de desenvolvedores do Pinterest" feito={temApp}>
        <p className="text-body-sm text-muted-foreground">
          Em <strong>My apps</strong>, clique em <strong>Connect app</strong>, preencha os dados e, em <strong>Redirect URIs</strong>, adicione exatamente este endereço:
        </p>
        <Button asChild size="sm" variant="secondary">
          <a href="https://developers.pinterest.com/apps/" target="_blank" rel="noopener noreferrer">
            Abrir portal do Pinterest <ExternalLink />
          </a>
        </Button>
        <CopiarTexto valor={redirectUri} rotulo="Redirect URI do Pinterest" />
        {!redirectUri.startsWith("https://") && (
          <p className="text-caption text-warning">Endereço local detectado: para conectar de verdade, use o site publicado (https).</p>
        )}
      </Passo>

      <Passo numero={2} titulo="Copie o App ID e o App secret e escolha o ambiente" feito={temApp}>
        {permissoes.administrar ? (
          <form
            className="space-y-3"
            autoComplete="off"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!idValido || !secretValido) return;
              const ok = await app.executar(() => salvarAppPinterest(clientId.trim(), secret.trim() || undefined, ambiente));
              if (ok) setSecret("");
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="App ID" dica={clientId && !idValido ? "O App ID tem só números." : undefined}>
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  inputMode="numeric"
                  placeholder="Ex.: 1512345"
                  aria-invalid={Boolean(clientId) && !idValido}
                  disabled={app.pendente}
                />
              </Campo>
              <Campo label="App secret">
                <CampoSegredo
                  mascara={mascaraSecret}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Cole o App secret"
                  disabled={app.pendente}
                />
              </Campo>
            </div>
            <Campo label="Ambiente">
              <SeletorAmbiente valor={ambiente} onChange={setAmbiente} disabled={app.pendente} />
            </Campo>
            <ExplicacaoAmbiente />
            <Button type="submit" size="sm" disabled={app.pendente || !idValido || !secretValido || !mudou}>
              Salvar credenciais
            </Button>
          </form>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            {temApp
              ? `App configurado (App ID ${clientIdSalvo}, ambiente ${ambienteSalvo === "sandbox" ? "Sandbox" : "Produção"}).`
              : "Ainda não configurado."}
          </p>
        )}
      </Passo>

      <Passo numero={3} titulo={vinculado ? "Reconecte quando precisar" : "Conecte a sua conta"} feito={integ.status === "connected"}>
        <p className="text-body-sm text-muted-foreground">
          Você autoriza no Pinterest e volta para cá. Os seus boards são sincronizados logo em seguida.
        </p>
        {permissoes.administrar &&
          (temApp ? (
            <Button asChild variant="tech" size="sm">
              <a href="/api/ml/oauth/pinterest/start">
                <PlugZap /> {vinculado ? "Reconectar Pinterest" : "Conectar Pinterest"}
              </a>
            </Button>
          ) : (
            <Button variant="tech" size="sm" disabled title="Salve o App ID e o App secret primeiro">
              <PlugZap /> Conectar Pinterest
            </Button>
          ))}
      </Passo>
    </ol>
  );

  return (
    <CartaoIntegracao
      integ={integ}
      tz={tz}
      titulo="Pinterest"
      descricao="Lista e cria boards, publica Pins e coleta métricas de desempenho."
      icone={<Pin className="size-5" />}
      mostrarTokens
    >
      {vinculado && (
        <div className="flex flex-wrap items-center gap-2 text-caption">
          <Badge variant={ambienteSalvo === "sandbox" ? "warning" : "tech"}>
            {ambienteSalvo === "sandbox" ? <FlaskConical className="size-3.5" aria-hidden /> : <CheckCircle2 className="size-3.5" aria-hidden />}
            {ambienteSalvo === "sandbox" ? "Sandbox — Pins só para você, sem métricas" : "Produção"}
          </Badge>
        </div>
      )}

      {permissoes.administrar && (vinculado ? <Recolhivel titulo="Configuração do app (passo a passo)">{guia}</Recolhivel> : guia)}

      {permissoes.administrar && (
        <Recolhivel
          titulo={
            <span className="flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" aria-hidden /> Usar token de acesso (teste/sandbox)
            </span>
          }
        >
          <form
            className="space-y-3"
            autoComplete="off"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!tokenValido) return;
              const ok = await tok.executar(() => salvarTokenPinterest(token.trim(), ambienteToken));
              if (ok) setToken("");
            }}
          >
            <p className="text-body-sm text-muted-foreground">
              Alternativa para testes: no portal do Pinterest, abra o seu app e gere um token de acesso (vale ~30 dias e não renova sozinho). Cole aqui —
              ele substitui a conexão atual.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Token de acesso">
                <CampoSegredo value={token} onChange={(e) => setToken(e.target.value)} placeholder="pina_…" disabled={tok.pendente} />
              </Campo>
              <Campo label="Ambiente do token">
                <SeletorAmbiente valor={ambienteToken} onChange={setAmbienteToken} disabled={tok.pendente} />
              </Campo>
            </div>
            <Button type="submit" size="sm" variant="secondary" disabled={!tokenValido || tok.pendente}>
              Salvar e testar token
            </Button>
          </form>
        </Recolhivel>
      )}

      {vinculado && (
        <div className="space-y-2">
          <p className="text-body-sm font-semibold">Permissões (escopos)</p>
          {integ.scopes.length === 0 ? (
            <p className="text-caption text-muted-foreground">
              O Pinterest não informou os escopos desta conexão (comum com token manual). Se algo falhar por permissão, reconecte.
            </p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-2">
                {ESCOPOS_NECESSARIOS.map((e) => {
                  const ok = concedidos.has(e.escopo);
                  return (
                    <li key={e.escopo}>
                      <Badge variant={ok ? "success" : "destructive"} title={e.escopo}>
                        {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
                        {e.label}
                        <span className="sr-only">{ok ? " — concedido" : " — faltando"}</span>
                      </Badge>
                    </li>
                  );
                })}
              </ul>
              {faltando.length > 0 && (
                <p className="text-caption text-destructive">
                  Faltam {faltando.length} permissão(ões). Clique em <strong>Reconectar Pinterest</strong> e aceite todas as permissões pedidas.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {conectado && (
        <div className="space-y-3 rounded-xl bg-secondary/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="size-4 text-tech" aria-hidden />
              <p className="text-body-sm">
                <span className="tabular font-semibold">{boardsAtivos}</span> board{boardsAtivos === 1 ? "" : "s"} ativo{boardsAtivos === 1 ? "" : "s"}
              </p>
              <Link href="/ml/configuracoes?secao=publicacao" className="text-caption font-medium text-tech underline-offset-4 hover:underline">
                Escolher boards por categoria
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {permissoes.operar && (
                <AcaoBotao
                  size="sm"
                  variant="secondary"
                  acao={sincronizarBoardsAgora}
                  semRefresh
                  aoConcluir={(r) => setJobBoards(typeof r.jobId === "string" ? r.jobId : null)}
                >
                  <RefreshCw /> Sincronizar boards
                </AcaoBotao>
              )}
              {permissoes.administrar && (
                <Button size="sm" variant="secondary" onClick={() => setCriando(true)}>
                  <Plus /> Criar board
                </Button>
              )}
              {permissoes.administrar && ambienteSalvo === "sandbox" && boardTesteId && (
                <AcaoBotao
                  size="sm"
                  variant="secondary"
                  acao={() => testarPinSandbox(boardTesteId)}
                  confirmar="Criar um Pin de teste no sandbox (visível só para você) no board padrão?"
                >
                  <Wifi /> Testar Pin no sandbox
                </AcaoBotao>
              )}
            </div>
          </div>
          {jobBoards && <JobStatus jobId={jobBoards} />}
        </div>
      )}

      {!permissoes.administrar && <SoLeitura />}

      {(permissoes.operar || permissoes.administrar) && vinculado && (
        <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
          {permissoes.operar && (
            <AcaoBotao size="sm" variant="secondary" acao={() => testarIntegracao("pinterest")}>
              <Wifi /> Testar conexão
            </AcaoBotao>
          )}
          {permissoes.administrar && (
            <AcaoBotao
              size="sm"
              variant="ghost"
              className="text-destructive"
              acao={() => desconectarIntegracao("pinterest")}
              confirmar="Desconectar o Pinterest? Publicações agendadas ficam paradas até você conectar de novo. O App ID e o App secret continuam salvos."
            >
              <Unplug /> Desconectar
            </AcaoBotao>
          )}
        </div>
      )}

      {permissoes.administrar && <DialogoCriarBoard aberto={criando} onOpenChange={setCriando} />}
    </CartaoIntegracao>
  );
}
