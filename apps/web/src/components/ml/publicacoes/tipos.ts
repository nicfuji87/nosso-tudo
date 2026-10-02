/**
 * Tipos e utilitários puros da tela de Publicações (servem ao server e ao client).
 */
import { deFusoParaUtc, partesNoFuso } from "@/lib/ml/tempo";

export interface ItemValidacao {
  chave: string;
  ok: boolean;
  bloqueia: boolean;
  detalhe: string;
}

export interface BoardOpcao {
  id: string;
  name: string;
}

export interface PinView {
  id: string;
  status: string;
  title: string | null;
  description: string | null;
  alt_text: string | null;
  link_url: string | null;
  media_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  environment: string | null;
  last_error: string | null;
  external_url: string | null;
  attempts: number;
  validated_at: string | null;
  created_at: string;
  updated_at: string;
  duplicated_from: string | null;
  validacao: ItemValidacao[];
  board: { id: string; name: string } | null;
  product: { id: string; title: string; permalink: string | null } | null;
  creative: CriativoResumo | null;
  /** V2: família (pin.family_id ou creative.family_id). */
  familia: { id: string; name: string } | null;
  /** V2: flag interno de IA (pin.ai_modified) e se a declaração foi aceita pela API ao publicar. */
  ai_modified: boolean;
  ai_disclosure_sent: boolean | null;
  /** V2: link de afiliado usado pelo Pin (validação de redirect). */
  link: LinkResumo | null;
  /** V2 §16: outros Pins do mesmo produto em ±7 dias (agendados/publicados). */
  repeticao: { ordem: number; total: number } | null;
  /** V2 §16: cooldown entre variantes do mesmo produto, calculado no servidor. */
  cooldown: { regraHoras: number; faltamHoras: number; liberaEm: string | null } | null;
}

export interface CriativoResumo {
  id: string;
  headline: string | null;
  visual_type: string | null;
  fidelity_mode: string | null;
  has_text_overlay: boolean | null;
  family_id: string | null;
}

export interface LinkResumo {
  id: string;
  label: string | null;
  redirect_status: string;
  final_host: string | null;
  final_url: string | null;
  last_checked_at: string | null;
}

/** Validação do redirect do link de afiliado (V2 §10). */
export const REDIRECT_STATUS: Record<string, { label: string; tom: "success" | "warning" | "destructive" | "muted"; dica: string }> = {
  ok: { label: "Destino ok", tom: "success", dica: "O link redireciona para o anúncio esperado no Mercado Livre." },
  ok_unverified: {
    label: "Destino ML (não confirmado)",
    tom: "warning",
    dica: "Redireciona para o Mercado Livre, mas não foi possível confirmar que é o mesmo anúncio.",
  },
  inconsistent: { label: "Destino inconsistente", tom: "destructive", dica: "O link leva a outro destino — gere um novo link de afiliado." },
  error: { label: "Erro ao validar", tom: "destructive", dica: "Não foi possível seguir o redirecionamento. Tente validar de novo." },
  unchecked: { label: "Destino não validado", tom: "muted", dica: "O redirecionamento ainda não foi verificado." },
};

/** Colunas lidas de ml_pins (sem os blobs que a tela não usa). */
export const PIN_COLUNAS: string =
  "id, status, title, description, alt_text, link_url, media_url, scheduled_at, published_at, environment, last_error, external_url, attempts, validated_at, created_at, updated_at, duplicated_from, validation, board_id, product_id, creative_id, family_id, ai_modified, ai_disclosure_sent, affiliate_link_id";

/** Extrai `validation.itens` de forma defensiva (jsonb livre). */
export function itensValidacao(v: unknown): ItemValidacao[] {
  if (!v || typeof v !== "object") return [];
  const itens = (v as { itens?: unknown }).itens;
  if (!Array.isArray(itens)) return [];
  return itens
    .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
    .map((i) => ({
      chave: String(i.chave ?? ""),
      ok: Boolean(i.ok),
      bloqueia: Boolean(i.bloqueia),
      detalhe: String(i.detalhe ?? ""),
    }));
}

export const ROTULO_VALIDACAO: Record<string, string> = {
  produto_check: "Revalidação",
  produto_disponivel: "Disponível",
  preco_estavel: "Preço",
  produto_status: "Produto",
  link_afiliado: "Link",
  board: "Board",
  pinterest: "Pinterest",
  imagem: "Imagem",
  repeticao: "Repetição",
  textos: "Textos",
  criativo_aprovado: "Criativo",
  pacote: "Pacote Pinterest",
  fidelidade: "Fidelidade",
  redirect: "Destino do link",
  ai_disclosure: "Declaração de IA",
};

/** Instante de referência do Pin no calendário: publicado > agendado. */
export function quandoPin(p: Pick<PinView, "published_at" | "scheduled_at">): string | null {
  return p.published_at ?? p.scheduled_at;
}

// ---------------------------------------------------------------------------
// Estados → ações possíveis (espelha as regras de lib/ml/servicos/publicacao)
// ---------------------------------------------------------------------------
const EDITAVEIS = ["draft", "pending_approval", "scheduled", "blocked", "paused", "failed"];

export const pode = {
  publicarAgora: (s: string) => ["scheduled", "draft", "pending_approval", "failed", "blocked", "paused"].includes(s),
  agendar: (s: string) => [...EDITAVEIS, "canceled"].includes(s),
  aprovar: (s: string) => s === "pending_approval",
  pausar: (s: string) => s === "scheduled",
  retomar: (s: string) => s === "paused",
  cancelar: (s: string) => EDITAVEIS.includes(s),
  editar: (s: string) => EDITAVEIS.includes(s),
  revalidar: (s: string) => EDITAVEIS.includes(s),
  duplicar: (s: string) => s !== "publishing",
};

export function precoBloqueando(p: Pick<PinView, "validacao">): boolean {
  return p.validacao.some((i) => i.chave === "preco_estavel" && i.bloqueia);
}

// ---------------------------------------------------------------------------
// Data/hora no fuso configurado ↔ <input type="datetime-local">
// ---------------------------------------------------------------------------
const dois = (n: number) => String(n).padStart(2, "0");

export function paraInputLocal(data: Date | string, tz: string): string {
  const p = partesNoFuso(typeof data === "string" ? new Date(data) : data, tz);
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}T${dois(p.hora)}:${dois(p.minuto)}`;
}

/** "YYYY-MM-DDTHH:MM" interpretado no fuso configurado → ISO UTC. */
export function deInputLocal(valor: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(valor);
  if (!m) return null;
  const d = deFusoParaUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), tz);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------------------
// URL (filtros persistidos)
// ---------------------------------------------------------------------------
export type ParamsUrl = Record<string, string | undefined>;

/** Monta href preservando os parâmetros atuais e aplicando mudanças (null remove). */
export function hrefCom(base: string, atuais: ParamsUrl, mudancas: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(atuais)) if (v) sp.set(k, v);
  for (const [k, v] of Object.entries(mudancas)) {
    if (v == null || v === "") sp.delete(k);
    else sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

export function encurtarUrl(url: string, max = 48): string {
  const sem = url.replace(/^https?:\/\/(www\.)?/, "");
  return sem.length > max ? `${sem.slice(0, max - 1)}…` : sem;
}
