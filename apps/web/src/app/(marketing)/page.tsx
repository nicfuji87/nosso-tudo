import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Check,
  FileText,
  Layers,
  MessageCircle,
  Mic,
  Receipt,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/marketing/reveal";
import { AppPreview } from "@/components/marketing/app-preview";
import { CategoryIcon } from "@/components/patterns/category-icon";

const RECURSOS = [
  {
    icon: MessageCircle,
    title: "Captura pelo WhatsApp",
    desc: "Mande foto da nota, um áudio ou só escreva. O agente entende, categoriza e lança por você.",
  },
  {
    icon: Sparkles,
    title: "Assistente de IA",
    desc: "Pergunte “quanto gastei com mercado?” e receba a resposta com gráfico, em segundos.",
  },
  {
    icon: FileText,
    title: "Conciliação de faturas",
    desc: "Importe o PDF do cartão. A gente casa cada lançamento e só pergunta quando há dúvida real.",
  },
  {
    icon: Layers,
    title: "Categorias que se adaptam",
    desc: "Crie projetos (viagem, reforma) e compromissos (compra coletiva) — não só categorias fixas.",
  },
  {
    icon: Users,
    title: "A família toda",
    desc: "Até 6 membros. Crianças entram como entidades nas transações, sem precisar de login.",
  },
  {
    icon: ShieldCheck,
    title: "Seguro por princípio",
    desc: "Isolamento por workspace (RLS), criptografia em trânsito e repouso, LGPD nativa.",
  },
];

const CATEGORIAS = [
  { nome: "Moradia", icone: "🏠", cor: "#3D6D84" },
  { nome: "Alimentação", icone: "🍽️", cor: "#FF7043" },
  { nome: "Transporte", icone: "🚗", cor: "#8FA993" },
  { nome: "Saúde", icone: "⚕️", cor: "#EC407A" },
  { nome: "Lazer", icone: "🎮", cor: "#7E57C2" },
  { nome: "Educação", icone: "📚", cor: "#F59E0B" },
];

const PASSOS = [
  {
    n: "01",
    icon: Camera,
    title: "Capture do seu jeito",
    desc: "Foto, áudio, texto no WhatsApp ou um toque no app. Sem planilha, sem digitação obrigatória.",
  },
  {
    n: "02",
    icon: Receipt,
    title: "A gente organiza",
    desc: "A IA resolve estabelecimentos e categorias, concilia faturas e aprende com cada correção.",
  },
  {
    n: "03",
    icon: Sparkles,
    title: "Você entende tudo",
    desc: "A Home responde “como estamos?” antes dos números. Pergunte o resto ao assistente.",
  },
];

const PRO_FEATURES = [
  "Tudo ilimitado (transações, cartões, contas)",
  "Captura por WhatsApp (foto, áudio, PDF)",
  "Assistente de IA conversacional",
  "Conciliação automática de faturas",
  "Investimentos, metas e relatórios",
  "Até 6 membros · sem anúncios",
];

const FREE_FEATURES = [
  "100 transações por mês",
  "1 cartão · 2 contas",
  "Categorias com comportamento",
  "Recorrências e contas fixas",
  "Lançamentos manuais no app",
];

export default function LandingPage() {
  return (
    <>
      {/* ===================== HERO ===================== */}
      <section className="atmosphere grain relative overflow-hidden">
        <div className="container relative grid items-center gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          {/* Ghost wordmark de fundo */}
          <span
            aria-hidden
            className="pointer-events-none absolute -left-4 top-8 select-none text-ghost text-[7rem] font-bold leading-none tracking-tighter sm:text-[10rem] lg:text-[12rem]"
          >
            Nosso
          </span>

          <div className="relative">
            <Reveal>
              <Badge variant="accent" className="mb-6">
                <span className="size-1.5 rounded-full bg-accent" />
                O sistema operacional da vida familiar
              </Badge>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="text-balance text-display-md font-bold tracking-tight sm:text-display-lg">
                As finanças da casa,{" "}
                <span className="text-brand-petroleum">sem fricção.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 max-w-md text-pretty text-body-lg text-muted-foreground">
                Registre gastos por uma mensagem no WhatsApp, concilie faturas
                automaticamente e entenda para onde vai o dinheiro — com um
                assistente que aprende com a sua família.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" asChild>
                  <Link href="/cadastrar">
                    Começar grátis <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <Link href="#como-funciona">Como funciona</Link>
                </Button>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div className="mt-6 flex items-center gap-4 text-caption text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-success" /> Sem cartão de crédito
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-success" /> 14 dias de Pro grátis
                </span>
              </div>
            </Reveal>
          </div>

          {/* App preview flutuante */}
          <Reveal delay={200} className="relative flex justify-center lg:justify-end">
            <div className="absolute inset-0 -z-10 mx-auto size-72 rounded-full bg-brand-sage/30 blur-3xl" />
            <div className="animate-float">
              <AppPreview />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== RECURSOS ===================== */}
      <section id="recursos" className="container py-20 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-overline uppercase tracking-wide text-accent">Recursos</p>
          <h2 className="mt-3 text-balance text-h1 font-semibold tracking-tight">
            Feito para o dia a dia de quem cuida de tudo
          </h2>
          <p className="mt-4 text-body-lg text-muted-foreground">
            Cada detalhe pensado para que controlar as finanças seja um
            subproduto natural da conversa em família.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {RECURSOS.map((r, i) => (
            <Reveal key={r.title} delay={i * 60}>
              <div className="group h-full rounded-xl border border-border/70 bg-card p-6 shadow-card transition-all duration-base ease-smooth hover:-translate-y-1 hover:shadow-card-hover">
                <div className="flex size-12 items-center justify-center rounded-[14px] bg-accent/15 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                  <r.icon className="size-5" />
                </div>
                <h3 className="mt-5 text-h4 font-semibold tracking-tight">{r.title}</h3>
                <p className="mt-2 text-body-sm text-muted-foreground">{r.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== CATEGORIAS ===================== */}
      <section className="border-y border-border/60 bg-background-warm/40">
        <div className="container grid items-center gap-14 py-20 lg:grid-cols-2 lg:py-28">
          <Reveal>
            <p className="text-overline uppercase tracking-wide text-accent">Flexível</p>
            <h2 className="mt-3 text-balance text-h1 font-semibold tracking-tight">
              Categorias que viram projetos, viagens e compras coletivas
            </h2>
            <p className="mt-4 text-body-lg text-muted-foreground">
              Além das categorias comuns, o Nosso Tudo entende{" "}
              <strong className="font-medium text-foreground">projetos</strong> (uma
              viagem com orçamento e participantes) e{" "}
              <strong className="font-medium text-foreground">compromissos</strong>{" "}
              (uma compra coletiva com status de entrega). Cada família configura
              a própria realidade.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Comportamento por categoria: básico, projeto ou compromisso",
                "Coleções acompanham orçamento, prazo e status",
                "Itens individuais quando você quiser detalhar",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-body-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {CATEGORIAS.map((c) => (
                <div
                  key={c.nome}
                  className="flex flex-col items-center gap-3 rounded-xl border border-border/70 bg-card p-6 shadow-card transition-transform duration-base ease-smooth hover:-translate-y-1"
                >
                  <CategoryIcon icone={c.icone} cor={c.cor} size="lg" />
                  <span className="text-body-sm font-medium">{c.nome}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== COMO FUNCIONA ===================== */}
      <section id="como-funciona" className="container py-20 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-overline uppercase tracking-wide text-accent">Como funciona</p>
          <h2 className="mt-3 text-balance text-h1 font-semibold tracking-tight">
            Três passos. O resto é com a gente.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {PASSOS.map((p, i) => (
            <Reveal key={p.n} delay={i * 80}>
              <div className="relative h-full rounded-xl border border-border/70 bg-card p-7 shadow-card">
                <span className="tabular text-h2 font-semibold text-accent/40">{p.n}</span>
                <div className="mt-3 flex size-11 items-center justify-center rounded-[14px] bg-brand-graphite text-brand-offwhite">
                  <p.icon className="size-5" />
                </div>
                <h3 className="mt-4 text-h4 font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-2 text-body-sm text-muted-foreground">{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Mini-prova de captura */}
        <Reveal delay={120}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card p-6 text-body-sm shadow-card">
            <span className="text-muted-foreground">Capture com:</span>
            {[
              { icon: Camera, label: "Foto da nota" },
              { icon: Mic, label: "Áudio" },
              { icon: MessageCircle, label: "Mensagem" },
              { icon: FileText, label: "PDF da fatura" },
            ].map((m) => (
              <span
                key={m.label}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 font-medium"
              >
                <m.icon className="size-4 text-accent" /> {m.label}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ===================== STATS ===================== */}
      <section className="bg-brand-graphite">
        <div className="container py-20 lg:py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-h1 font-semibold tracking-tight text-brand-offwhite">
              Inteligência que melhora com o uso
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {[
              { label: "Conciliação automática", value: "> 80%", hint: "das transações casadas sem você" },
              { label: "Confirmar um item", value: "< 10s", hint: "no Inbox de Revisão" },
              { label: "Isolamento de dados", value: "100%", hint: "protegido por RLS, por workspace" },
            ].map((s, i) => (
              <Reveal key={s.label} delay={i * 80}>
                <div className="rounded-xl border border-brand-offwhite/10 bg-brand-offwhite/[0.03] p-6">
                  <p className="text-overline uppercase tracking-wide text-brand-offwhite/50">
                    {s.label}
                  </p>
                  <p className="tabular mt-2 text-display-md font-semibold tracking-tight text-brand-sage">
                    {s.value}
                  </p>
                  <p className="mt-1 text-caption text-brand-offwhite/60">{s.hint}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== PREÇOS ===================== */}
      <section id="precos" className="container py-20 lg:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-overline uppercase tracking-wide text-accent">Preços</p>
          <h2 className="mt-3 text-balance text-h1 font-semibold tracking-tight">
            Comece grátis. Cresça quando fizer sentido.
          </h2>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
          {/* Free */}
          <Reveal>
            <div className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-8 shadow-card">
              <h3 className="text-h3 font-semibold tracking-tight">Free</h3>
              <p className="mt-1 text-body-sm text-muted-foreground">
                Para começar a organizar.
              </p>
              <p className="tabular mt-6 text-display-md font-semibold tracking-tight">R$ 0</p>
              <p className="text-caption text-muted-foreground">para sempre · com anúncios</p>
              <ul className="mt-6 flex-1 space-y-3">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-body-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button variant="secondary" className="mt-8" asChild>
                <Link href="/cadastrar">Criar conta grátis</Link>
              </Button>
            </div>
          </Reveal>

          {/* Pro */}
          <Reveal delay={100}>
            <div className="relative flex h-full flex-col rounded-2xl border-2 border-brand-graphite bg-card p-8 shadow-elevated">
              <Badge className="absolute -top-3 left-8 bg-accent text-accent-foreground">
                Recomendado
              </Badge>
              <h3 className="text-h3 font-semibold tracking-tight">Pro</h3>
              <p className="mt-1 text-body-sm text-muted-foreground">
                Para a família toda, sem limites.
              </p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="tabular text-display-md font-semibold tracking-tight">
                  R$ 19,90
                </span>
                <span className="text-body-sm text-muted-foreground">/mês</span>
              </p>
              <p className="text-caption text-muted-foreground">
                ou R$ 199/ano (~17% off) · 14 dias grátis
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-body-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button className="mt-8" asChild>
                <Link href="/cadastrar">
                  Experimentar o Pro <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== CTA FINAL ===================== */}
      <section className="container pb-24">
        <Reveal>
          <div className="atmosphere-soft relative overflow-hidden rounded-2xl border border-border/70 bg-card px-8 py-16 text-center shadow-card">
            <h2 className="mx-auto max-w-2xl text-balance text-h1 font-semibold tracking-tight">
              Que tal a sua família organizando tudo num lugar só?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-body-lg text-muted-foreground">
              Leva menos de um minuto para começar. Sem cartão, sem compromisso.
            </p>
            <div className="mt-8 flex justify-center">
              <Button size="lg" asChild>
                <Link href="/cadastrar">
                  Criar minha conta <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
