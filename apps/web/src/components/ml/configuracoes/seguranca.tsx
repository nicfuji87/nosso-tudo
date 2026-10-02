"use client";

import Link from "next/link";
import { useState } from "react";
import { EyeOff, FileClock, KeyRound, Lock, ServerCog, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AcaoBotao } from "@/components/ml/acao-botao";
import { Campo, NativeSelect, Secao } from "@/components/ml/campos";
import { adicionarMembro, removerMembro } from "@/app/ml/(painel)/configuracoes/actions";
import { useAcao } from "@/components/ml/integracoes/comum";
import { formatarNoFuso } from "@/lib/ml/tempo";

export interface MembroLite {
  profile_id: string;
  role: string;
  created_at: string;
  nome: string | null;
  email: string | null;
}

const PAPEIS: { valor: string; label: string; desc: string }[] = [
  { valor: "viewer", label: "Visualizador", desc: "Só vê o painel e os relatórios." },
  { valor: "operator", label: "Operador", desc: "Aprova produtos, cola links, revisa artes e publica." },
  { valor: "admin", label: "Administrador", desc: "Tudo do operador + integrações, automações e configurações." },
  { valor: "owner", label: "Dono", desc: "Tudo + gerencia quem tem acesso." },
];
const LABEL_PAPEL = Object.fromEntries(PAPEIS.map((p) => [p.valor, p.label]));

export function ConfigSeguranca({
  membros,
  usuarioId,
  podeGerenciar,
  podeVerMembros,
  tz,
}: {
  membros: MembroLite[];
  usuarioId: string;
  /** owner: adicionar/remover */
  podeGerenciar: boolean;
  /** admin+: a RLS de ml_members só mostra a lista completa para admin+ */
  podeVerMembros: boolean;
  tz: string;
}) {
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("operator");
  const { pendente, executar } = useAcao();
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div className="space-y-6">
      <Secao titulo="Quem tem acesso" descricao="Pessoas com acesso à área de afiliados e o que cada uma pode fazer.">
        {!podeVerMembros ? (
          <p className="text-body-sm text-muted-foreground">Somente administradores veem a lista de membros.</p>
        ) : (
          <>
            {membros.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">Nenhum membro cadastrado além dos administradores da plataforma.</p>
            ) : (
              <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
                {membros.map((m) => {
                  const voce = m.profile_id === usuarioId;
                  const nome = m.nome || m.email || `Usuário ${m.profile_id.slice(0, 8)}…`;
                  return (
                    <li key={m.profile_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm font-medium">
                          {nome}
                          {voce && <span className="ml-1.5 text-caption font-normal text-muted-foreground">(você)</span>}
                        </p>
                        <p className="truncate text-caption text-muted-foreground" title={m.profile_id}>
                          {[
                            m.nome && m.email ? m.email : null,
                            !m.nome && !m.email ? `ID ${m.profile_id}` : null,
                            `desde ${formatarNoFuso(m.created_at, tz, { dateStyle: "short" })}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Badge variant={m.role === "owner" ? "tech" : m.role === "admin" ? "accent" : "default"}>{LABEL_PAPEL[m.role] ?? m.role}</Badge>
                      {podeGerenciar && !voce && (
                        <AcaoBotao
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          acao={() => removerMembro(m.profile_id)}
                          confirmar={`Remover o acesso de ${nome} à área de afiliados?`}
                        >
                          <Trash2 /> Remover
                        </AcaoBotao>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-caption text-muted-foreground">
              Administradores da plataforma Nosso Tudo são <strong>Donos</strong> automaticamente e não aparecem nesta lista. Nomes de outras pessoas podem
              aparecer só pelo ID, por privacidade.
            </p>
          </>
        )}

        {podeGerenciar && (
          <form
            className="mt-5 space-y-3 border-t border-border/70 pt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!emailValido) return;
              const ok = await executar(() => adicionarMembro(email.trim(), papel));
              if (ok) setEmail("");
            }}
          >
            <p className="flex items-center gap-2 text-body-sm font-semibold">
              <UserPlus className="size-4 text-tech" aria-hidden /> Dar acesso a alguém
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
              <Campo label="E-mail da conta no Nosso Tudo" dica="A pessoa precisa ter conta criada.">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" disabled={pendente} />
              </Campo>
              <Campo label="Papel" dica={PAPEIS.find((p) => p.valor === papel)?.desc}>
                <NativeSelect value={papel} onChange={(e) => setPapel(e.target.value)} disabled={pendente} className="w-full">
                  {PAPEIS.map((p) => (
                    <option key={p.valor} value={p.valor}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </Campo>
              <Button type="submit" disabled={!emailValido || pendente} className="sm:mb-6">
                <Users /> Salvar acesso
              </Button>
            </div>
            <p className="text-caption text-muted-foreground">Se a pessoa já tiver acesso, o papel é atualizado.</p>
          </form>
        )}
        {!podeGerenciar && podeVerMembros && <p className="mt-3 text-caption text-muted-foreground">Somente Donos podem adicionar ou remover pessoas.</p>}
      </Secao>

      <Secao titulo="Como protegemos seus dados">
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            {
              icone: KeyRound,
              titulo: "Segredos no cofre cifrado",
              texto: "Senhas, chaves e tokens ficam no Supabase Vault, cifrados. Nunca são enviados ao navegador — a tela só mostra os últimos caracteres.",
            },
            {
              icone: Lock,
              titulo: "Conexões oficiais e seguras",
              texto: "Mercado Livre e Pinterest são conectados pelo login oficial (OAuth), com código de uso único (state) e PKCE quando o provedor permite.",
            },
            {
              icone: EyeOff,
              titulo: "Leitura só para membros",
              texto: "O banco só mostra os dados da área para quem é membro (RLS), e o navegador não consegue gravar nada diretamente.",
            },
            {
              icone: ServerCog,
              titulo: "Toda alteração passa pelo servidor",
              texto: "Cada ação confere o seu papel e valida os dados antes de gravar. Botões ficam travados enquanto a ação roda, evitando duplicidade.",
            },
          ].map((i) => (
            <li key={i.titulo} className="flex gap-3 rounded-xl border border-border/70 p-4">
              <i.icone className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              <div>
                <p className="text-body-sm font-semibold">{i.titulo}</p>
                <p className="mt-0.5 text-caption text-muted-foreground">{i.texto}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/60 px-4 py-3">
          <p className="flex items-center gap-2 text-body-sm">
            <FileClock className="size-4 text-tech" aria-hidden />
            Toda mudança de configuração, conexão e publicação fica registrada na auditoria.
          </p>
          <Button asChild size="sm" variant="secondary">
            <Link href="/ml/logs?aba=auditoria">
              <ShieldCheck /> Ver auditoria
            </Link>
          </Button>
        </div>
      </Secao>
    </div>
  );
}
