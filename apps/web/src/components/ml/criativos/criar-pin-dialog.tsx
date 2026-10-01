"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Send, Zap } from "lucide-react";
import { toast } from "sonner";
import { criarPin } from "@/app/ml/(painel)/criativos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Campo, Checkbox, NativeSelect } from "@/components/ml/campos";
import { cn } from "@/lib/utils";
import type { BoardOpcao, CriativoView } from "./rotulos";

type Quando = "auto" | "agora" | "data";

const OPCOES: { valor: Quando; label: string; dica: string; icon: typeof Zap }[] = [
  { valor: "auto", label: "Próxima janela livre", dica: "Respeita janelas, limite diário e intervalo mínimo.", icon: CalendarClock },
  { valor: "agora", label: "Publicar agora", dica: "Valida o produto e publica em seguida.", icon: Zap },
  { valor: "data", label: "Data e hora", dica: "Escolha o horário exato.", icon: CalendarClock },
];

/** Criativo aprovado → Pin (agendado na janela, imediato ou em data escolhida). */
export function CriarPinDialog({
  criativo,
  boards,
  aberto,
  aoMudar,
}: {
  criativo: CriativoView | null;
  boards: BoardOpcao[];
  aberto: boolean;
  aoMudar: (v: boolean) => void;
}) {
  const router = useRouter();
  // Montado a cada abertura (o pai renderiza só quando há criativo), então o estado inicial basta.
  const [boardId, setBoardId] = useState(() => {
    if (criativo?.board_id && boards.some((b) => b.id === criativo.board_id)) return criativo.board_id;
    return boards.find((b) => b.is_default)?.id ?? "";
  });
  const [quando, setQuando] = useState<Quando>("auto");
  const [dataHora, setDataHora] = useState("");
  const [ignorar, setIgnorar] = useState(false);
  const [pendente, iniciar] = useTransition();

  const dataInvalida = quando === "data" && (!dataHora || Number.isNaN(new Date(dataHora).getTime()) || new Date(dataHora).getTime() < Date.now());

  function confirmar() {
    if (!criativo || dataInvalida) return;
    const valorQuando = quando === "data" ? new Date(dataHora).toISOString() : quando;
    iniciar(async () => {
      const r = await criarPin(criativo.id, { boardId: boardId || null, quando: valorQuando, ignorarRepeticao: ignorar });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.mensagem);
      aoMudar(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !pendente && aoMudar(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar Pin</DialogTitle>
          <DialogDescription className="line-clamp-2">{criativo?.title ?? criativo?.headline ?? "Criativo aprovado"}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirmar();
          }}
        >
          <Campo label="Board" dica={boards.length ? undefined : "Nenhum board ativo — sincronize em Integrações."}>
            <NativeSelect className="w-full" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              <option value="">Board padrão / mapeado pela categoria</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.is_default ? " (padrão)" : ""}
                </option>
              ))}
            </NativeSelect>
          </Campo>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-body-sm font-medium">Quando publicar</legend>
            {OPCOES.map((o) => (
              <label
                key={o.valor}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                  quando === o.valor ? "border-tech bg-tech/5" : "border-border hover:bg-secondary/50",
                )}
              >
                <input
                  type="radio"
                  name="quando"
                  value={o.valor}
                  checked={quando === o.valor}
                  onChange={() => setQuando(o.valor)}
                  className="mt-1 accent-[rgb(var(--tech))]"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-1.5 text-body-sm font-medium">
                    <o.icon className="size-3.5 text-muted-foreground" aria-hidden /> {o.label}
                  </span>
                  <span className="block text-caption text-muted-foreground">{o.dica}</span>
                </span>
              </label>
            ))}
            {quando === "data" && (
              <Input
                type="datetime-local"
                value={dataHora}
                onChange={(e) => setDataHora(e.target.value)}
                aria-label="Data e hora da publicação"
                aria-invalid={dataInvalida}
                required
              />
            )}
            {quando === "data" && dataHora && dataInvalida && <p className="text-caption text-destructive">Escolha um horário no futuro.</p>}
          </fieldset>

          <label className="flex items-start gap-2.5 text-body-sm">
            <Checkbox checked={ignorar} onChange={(e) => setIgnorar(e.target.checked)} className="mt-0.5" />
            <span>
              Ignorar regra de repetição
              <span className="block text-caption text-muted-foreground">Permite repostar o mesmo produto dentro da janela de duplicação.</span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => aoMudar(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" variant="tech" disabled={pendente || dataInvalida}>
              {pendente ? <Loader2 className="animate-spin" /> : <Send />}
              {quando === "agora" ? "Publicar agora" : "Criar Pin"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
