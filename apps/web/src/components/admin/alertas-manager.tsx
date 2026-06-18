"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Send,
  Zap,
  BellRing,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  salvarAlerta,
  excluirAlerta,
  alternarAlerta,
  dispararAlertasAgora,
  testarEnvioWhatsapp,
} from "@/app/app/admin/actions";
import type {
  AlertaDetalhe,
  DestinatarioVerificado,
  EnvioRecente,
  FrequenciaAlerta,
  PublicoAlerta,
  TipoAlerta,
} from "@/lib/admin/alertas";

const TIPO_LABEL: Record<TipoAlerta, string> = {
  saldo_negativo: "Saldo negativo",
  orcamento_estourado: "Orçamento estourou",
  orcamento_perto: "Orçamento perto do limite",
  cartao_limite: "Cartão perto do limite",
  resumo_semanal: "Resumo semanal",
  resumo_mensal: "Resumo mensal",
  personalizado: "Mensagem personalizada",
  assinaturas_fantasma: "Assinaturas fantasma",
  gastos_invisiveis: "Gastos invisíveis",
};

const TIPO_DESC: Record<TipoAlerta, string> = {
  saldo_negativo: "Avisa quando o saldo do mês fica negativo.",
  orcamento_estourado: "Avisa quando um orçamento passa de 100%.",
  orcamento_perto: "Avisa quando um orçamento chega perto do limite (%).",
  cartao_limite: "Avisa quando um cartão chega perto do limite (%).",
  resumo_semanal: "Manda um resumo de receitas/despesas da semana.",
  resumo_mensal: "Manda um resumo de receitas/despesas do mês.",
  personalizado: "Você escreve a mensagem; a Nia só dispara no agendamento.",
  assinaturas_fantasma: "Recorrências supérfluas que pesam no ano — vale rever.",
  gastos_invisiveis: "Soma das compras pequenas (< R$ 35) que vazam no mês.",
};

const FREQ_LABEL: Record<FrequenciaAlerta, string> = {
  imediato: "Na hora (checa de hora em hora)",
  diario: "Diário",
  semanal: "Semanal",
  mensal: "Mensal",
};

const PUBLICO_LABEL: Record<PublicoAlerta, string> = {
  todos_pro: "Todos os assinantes Pro",
  especificos: "Usuários específicos",
};

const DIAS_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const TIPOS: TipoAlerta[] = [
  "saldo_negativo",
  "orcamento_estourado",
  "orcamento_perto",
  "cartao_limite",
  "resumo_semanal",
  "resumo_mensal",
  "assinaturas_fantasma",
  "gastos_invisiveis",
  "personalizado",
];
const TIPOS_COM_LIMIAR: TipoAlerta[] = ["orcamento_perto", "cartao_limite"];

const PLACEHOLDERS =
  "{nome} {espaco} {saldo} {receitas} {despesas} {categoria} {gasto} {planejado} {pct} {cartao} {limite} {periodo} {qtd} {total} {itens}";

interface FormState {
  id?: string;
  nome: string;
  tipo: TipoAlerta;
  frequencia: FrequenciaAlerta;
  hora: number;
  diaSemana: number;
  diaMes: number;
  limiarPct: number;
  template: string;
  publicoAlvo: PublicoAlerta;
  ativo: boolean;
  alvoKeys: Set<string>;
}

const alvoKey = (d: { workspaceId: string; profileId: string | null }) =>
  `${d.workspaceId}:${d.profileId ?? ""}`;

function novoForm(): FormState {
  return {
    nome: "",
    tipo: "saldo_negativo",
    frequencia: "imediato",
    hora: 10,
    diaSemana: 1,
    diaMes: 1,
    limiarPct: 80,
    template: "",
    publicoAlvo: "todos_pro",
    ativo: false,
    alvoKeys: new Set(),
  };
}

function formDeAlerta(a: AlertaDetalhe): FormState {
  return {
    id: a.id,
    nome: a.nome,
    tipo: a.tipo,
    frequencia: a.frequencia,
    hora: a.hora,
    diaSemana: a.diaSemana ?? 1,
    diaMes: a.diaMes ?? 1,
    limiarPct: Number((a.parametros?.["limiar_pct"] as number) ?? 80),
    template: a.template ?? "",
    publicoAlvo: a.publicoAlvo,
    ativo: a.ativo,
    alvoKeys: new Set(a.alvos.map(alvoKey)),
  };
}

function resumoFrequencia(a: AlertaDetalhe): string {
  if (a.frequencia === "imediato") return "Na hora";
  if (a.frequencia === "diario") return `Diário · ${String(a.hora).padStart(2, "0")}h`;
  if (a.frequencia === "semanal")
    return `${DIAS_SEMANA[a.diaSemana ?? 1]} · ${String(a.hora).padStart(2, "0")}h`;
  return `Dia ${a.diaMes ?? 1} · ${String(a.hora).padStart(2, "0")}h`;
}

export function AlertasManager({
  alertas,
  destinatarios,
  envios,
  uazapiPronto,
}: {
  alertas: AlertaDetalhe[];
  destinatarios: DestinatarioVerificado[];
  envios: EnvioRecente[];
  uazapiPronto: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [testeOpen, setTesteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function abrirNovo() {
    setForm(novoForm());
  }
  function abrirEdicao(a: AlertaDetalhe) {
    setForm(formDeAlerta(a));
  }

  function salvar() {
    if (!form) return;
    startTransition(async () => {
      const alvos = [...form.alvoKeys].map((k) => {
        const [workspaceId, profileId] = k.split(":");
        return { workspaceId, profileId: profileId || null };
      });
      const res = await salvarAlerta({
        id: form.id,
        nome: form.nome,
        tipo: form.tipo,
        ativo: form.ativo,
        frequencia: form.frequencia,
        hora: form.hora,
        diaSemana: form.diaSemana,
        diaMes: form.diaMes,
        limiarPct: form.limiarPct,
        template: form.template,
        publicoAlvo: form.publicoAlvo,
        alvos,
      });
      if (res.error) {
        toast.error("Erro", { description: res.error });
        return;
      }
      toast.success(form.id ? "Alerta atualizado" : "Alerta criado");
      setForm(null);
      router.refresh();
    });
  }

  function toggle(a: AlertaDetalhe, ativo: boolean) {
    startTransition(async () => {
      const res = await alternarAlerta(a.id, ativo);
      if (res.error) toast.error("Erro", { description: res.error });
      else router.refresh();
    });
  }

  function remover(a: AlertaDetalhe) {
    if (!confirm(`Excluir o alerta "${a.nome}"?`)) return;
    startTransition(async () => {
      const res = await excluirAlerta(a.id);
      if (res.error) toast.error("Erro", { description: res.error });
      else {
        toast.success("Alerta excluído");
        router.refresh();
      }
    });
  }

  function disparar(alertaId?: string) {
    startTransition(async () => {
      const res = await dispararAlertasAgora(alertaId);
      if (!res.ok) {
        toast.error("Falha no disparo", { description: res.error });
        return;
      }
      toast.success("Disparo concluído", {
        description: `Avaliados: ${res.avaliados ?? 0} · Enviados: ${res.enviados ?? 0} · Falhas: ${res.falhas ?? 0} · Pulados: ${res.pulados ?? 0}`,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={abrirNovo}>
          <Plus className="size-4" />
          Novo alerta
        </Button>
        <Button variant="secondary" onClick={() => disparar()} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          Disparar agora
        </Button>
        <Button variant="ghost" onClick={() => setTesteOpen(true)} disabled={!uazapiPronto}>
          <Send className="size-4" />
          Enviar teste
        </Button>
      </div>

      {/* Lista de alertas */}
      <div className="space-y-3">
        {alertas.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-body-sm text-muted-foreground">
              Nenhum alerta ainda. Crie o primeiro com “Novo alerta”.
            </CardContent>
          </Card>
        ) : (
          alertas.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-secondary/70 p-2">
                    <BellRing className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{a.nome}</p>
                      <Badge size="sm">{TIPO_LABEL[a.tipo]}</Badge>
                    </div>
                    <p className="mt-0.5 text-caption text-muted-foreground">
                      {resumoFrequencia(a)} ·{" "}
                      {a.publicoAlvo === "todos_pro"
                        ? "Todos Pro"
                        : `${a.totalAlvos} destinatário${a.totalAlvos === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={a.ativo}
                    onCheckedChange={(v) => toggle(a, v)}
                    disabled={pending}
                    aria-label="Ativo"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => disparar(a.id)}
                    disabled={pending}
                    title="Disparar este agora"
                  >
                    <Zap className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => abrirEdicao(a)} title="Editar">
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remover(a)}
                    disabled={pending}
                    title="Excluir"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Envios recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-h4">Envios recentes</CardTitle>
          <CardDescription>Últimos 20 disparos (telefone mascarado).</CardDescription>
        </CardHeader>
        <CardContent>
          {envios.length === 0 ? (
            <p className="py-4 text-center text-body-sm text-muted-foreground">
              Nenhum envio ainda.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {envios.map((e) => (
                <div key={e.id} className="flex items-start gap-3 py-2.5">
                  {e.status === "enviado" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm">{e.mensagem ?? e.erro ?? "—"}</p>
                    <p className="text-caption text-muted-foreground">
                      {e.alertaNome ?? "—"} · {e.telefoneHint ?? "—"} ·{" "}
                      {new Date(e.data).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form de criar/editar */}
      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        {form && (
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar alerta" : "Novo alerta"}</DialogTitle>
              <DialogDescription>{TIPO_DESC[form.tipo]}</DialogDescription>
            </DialogHeader>

            <AlertaForm
              form={form}
              setForm={setForm}
              destinatarios={destinatarios}
            />

            <DialogFooter>
              <Button variant="ghost" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {form.id ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Dialog de teste */}
      <TesteDialog open={testeOpen} onOpenChange={setTesteOpen} />
    </div>
  );
}

function AlertaForm({
  form,
  setForm,
  destinatarios,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  destinatarios: DestinatarioVerificado[];
}) {
  const up = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  const ehLimiar = TIPOS_COM_LIMIAR.includes(form.tipo);
  const ehPersonalizado = form.tipo === "personalizado";

  function toggleAlvo(key: string) {
    const next = new Set(form.alvoKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    up({ alvoKeys: next });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="al-nome">Nome</Label>
        <Input
          id="al-nome"
          value={form.nome}
          onChange={(e) => up({ nome: e.target.value })}
          placeholder="Ex.: Saldo negativo"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Tipo de regra</Label>
          <Select value={form.tipo} onValueChange={(v) => up({ tipo: v as TipoAlerta })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Frequência</Label>
          <Select
            value={form.frequencia}
            onValueChange={(v) => up({ frequencia: v as FrequenciaAlerta })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FREQ_LABEL) as FrequenciaAlerta[]).map((f) => (
                <SelectItem key={f} value={f}>
                  {FREQ_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Agendamento condicional */}
      {form.frequencia !== "imediato" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="al-hora">Hora do dia (0–23)</Label>
            <Input
              id="al-hora"
              type="number"
              min={0}
              max={23}
              value={form.hora}
              onChange={(e) => up({ hora: Number(e.target.value) })}
            />
          </div>
          {form.frequencia === "semanal" && (
            <div className="space-y-1.5">
              <Label>Dia da semana</Label>
              <Select
                value={String(form.diaSemana)}
                onValueChange={(v) => up({ diaSemana: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIAS_SEMANA.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {form.frequencia === "mensal" && (
            <div className="space-y-1.5">
              <Label htmlFor="al-diames">Dia do mês (1–28)</Label>
              <Input
                id="al-diames"
                type="number"
                min={1}
                max={28}
                value={form.diaMes}
                onChange={(e) => up({ diaMes: Number(e.target.value) })}
              />
            </div>
          )}
        </div>
      )}

      {ehLimiar && (
        <div className="space-y-1.5">
          <Label htmlFor="al-limiar">Limiar (%)</Label>
          <Input
            id="al-limiar"
            type="number"
            min={1}
            max={100}
            value={form.limiarPct}
            onChange={(e) => up({ limiarPct: Number(e.target.value) })}
          />
          <p className="text-caption text-muted-foreground">Avisa a partir deste percentual.</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="al-template">
          {ehPersonalizado ? "Mensagem" : "Mensagem (opcional)"}
        </Label>
        <textarea
          id="al-template"
          rows={3}
          value={form.template}
          onChange={(e) => up({ template: e.target.value })}
          placeholder={
            ehPersonalizado
              ? "Escreva a mensagem que a Nia vai enviar…"
              : "Deixe vazio para usar o texto padrão deste tipo."
          }
          className="w-full rounded-md border border-input bg-card px-4 py-2 text-body-sm text-foreground transition-shadow focus:outline-none focus-visible:border-foreground/40 focus-visible:shadow-focus"
        />
        <p className="text-caption text-muted-foreground">Variáveis: {PLACEHOLDERS}</p>
      </div>

      {/* Público */}
      <div className="space-y-1.5">
        <Label>Enviar para</Label>
        <Select
          value={form.publicoAlvo}
          onValueChange={(v) => up({ publicoAlvo: v as PublicoAlerta })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PUBLICO_LABEL) as PublicoAlerta[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PUBLICO_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {form.publicoAlvo === "especificos" && (
        <div className="space-y-2 rounded-lg border border-border/70 p-3">
          {destinatarios.length === 0 ? (
            <p className="text-caption text-muted-foreground">
              Nenhum número verificado ainda. Vincule um WhatsApp no app primeiro.
            </p>
          ) : (
            destinatarios.map((d) => {
              const key = alvoKey(d);
              const marcado = form.alvoKeys.has(key);
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => toggleAlvo(key)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-body-sm transition-colors",
                    marcado ? "bg-accent/10 ring-1 ring-accent/40" : "hover:bg-secondary/60",
                  )}
                >
                  <span>
                    <span className="font-medium">{d.nome}</span>{" "}
                    <span className="text-muted-foreground">· {d.workspaceNome}</span>
                  </span>
                  <span className="flex items-center gap-2 text-caption text-muted-foreground">
                    {d.telefoneHint}
                    {marcado && <CheckCircle2 className="size-4 text-accent" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2.5">
        <div>
          <p className="text-body-sm font-medium">Ativo</p>
          <p className="text-caption text-muted-foreground">Quando ligado, entra no ciclo do cron.</p>
        </div>
        <Switch checked={form.ativo} onCheckedChange={(v) => up({ ativo: v })} />
      </div>
    </div>
  );
}

function TesteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    const res = await testarEnvioWhatsapp({ telefone, mensagem });
    setEnviando(false);
    if (!res.ok) {
      toast.error("Falha no envio", { description: res.error });
      return;
    }
    toast.success("Mensagem de teste enviada");
    onOpenChange(false);
    setMensagem("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar teste</DialogTitle>
          <DialogDescription>
            Manda uma mensagem agora pelo WhatsApp da aplicação (uazapi), sem mexer nos alertas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="te-tel">Telefone (com DDI/DDD, só números)</Label>
            <Input
              id="te-tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="5511999998888"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="te-msg">Mensagem (opcional)</Label>
            <textarea
              id="te-msg"
              rows={2}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="🔔 Teste de alerta do Nosso Tudo."
              className="w-full rounded-md border border-input bg-card px-4 py-2 text-body-sm text-foreground transition-shadow focus:outline-none focus-visible:border-foreground/40 focus-visible:shadow-focus"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando || telefone.replace(/\D/g, "").length < 10}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
