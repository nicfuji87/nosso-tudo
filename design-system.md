# Design System — Nosso Tudo
**Referência visual extraída da inspiração Traflow**

> **Princípio fundamental:** este design system é a fonte única de verdade visual. Toda cor, tipografia, espaçamento e componente vive aqui e é reutilizado em toda a aplicação. Cores hardcoded em componentes são proibidas. Ver `PRD seção 8` (Diretrizes de Engenharia) para o contrato técnico de reuso.

---

## 1. Personalidade visual

**Tom:** orgânico, sereno, premium, calmo, brasileiro-suave.
Inspiração: campos de capim-rosa, luz natural, manhãs claras.
Antônimos: agressivo, técnico-frio, fintech-azul-genérico, alarmante.

A interface respira. Cards flutuam sobre fundos pastéis. Tipografia grande e confiante. Nada grita.

---

## 2. Paleta de cores

### 2.1 Cores principais

```css
:root {
  /* Fundos atmosféricos */
  --bg-primary: #FAF6F2;        /* cream/off-white principal */
  --bg-pink-soft: #F5E6E0;      /* rosado suave (faixa lateral) */
  --bg-pink-blush: #E8C5BD;     /* rosa-blush mais saturado */
  --bg-warm-haze: #F0E4DC;      /* gradiente de transição */

  /* Tipografia e contraste */
  --ink-primary: #0A0A0A;       /* preto profundo pra títulos e CTA */
  --ink-secondary: #525252;     /* cinza-chumbo pra subtítulos */
  --ink-tertiary: #9A9A9A;      /* cinza claro pra labels e captions */
  --ink-muted: #C4B8B0;         /* tom rosado dessaturado (textos hero blur) */

  /* Cards e superfícies */
  --surface-white: #FFFFFF;
  --surface-elevated: #FFFFFF;
  --surface-dark: #1A1A1A;      /* dark cards / footer */
  --surface-charcoal: #2A2A2A;  /* secondary dark */

  /* Acentos pastéis (ícones de categoria) */
  --accent-mint: #C8E6C9;       /* verde menta */
  --accent-lavender: #D4C5E8;   /* lavanda */
  --accent-peach: #FFD4B8;      /* pêssego */
  --accent-rose: #F5C2C7;       /* rosa */
  --accent-sun: #FFE4A8;        /* amarelo manteiga */
  --accent-sky: #C9E2F0;        /* azul céu */

  /* Acentos vibrantes (para ícones e detalhes) */
  --vivid-green: #4CAF50;
  --vivid-orange: #FF7043;
  --vivid-rose: #EC407A;
  --vivid-purple: #7E57C2;

  /* Feedback */
  --success: #10B981;
  --warning: #F59E0B;
  --danger: #EF4444;
  --info: #3B82F6;
}
```

### 2.2 Uso

- **Background da app:** `--bg-primary` predominante; faixas verticais com `--bg-pink-soft` opcionais nas laterais ou hero
- **Cards:** sempre `--surface-white` com sombra suave
- **Texto principal:** `--ink-primary`
- **CTAs:** fundo preto puro `--ink-primary`, texto branco
- **Ícones de categoria:** combinação de fundo pastel + ícone vivid (ex: fundo `--accent-mint` + ícone `--vivid-green`)
- **Modo escuro** (para implementar depois): inverte para `--surface-dark` como background

---

## 3. Tipografia

### 3.1 Fontes

**Display / Headings:** `Söhne` ou `General Sans` (alternativa free: `Geist Sans`)
- Grotesque moderna, geométrica, com personalidade
- Usar pesos: Bold (700) e Medium (500)

**Body:** `Inter` (alternativa: `Geist Sans` regular) — *usar com moderação dado warning do skill*
- **Alternativa recomendada para evitar look-and-feel AI-genérico:** `Söhne Buch`, `Geist`, ou `Söhne` em peso Regular

**Mono (números financeiros):** `JetBrains Mono` ou `IBM Plex Mono`
- Usado para valores monetários para alinhamento de dígitos

### 3.2 Escala tipográfica

```css
/* Display (hero) */
--text-display-xl: 6rem;   /* 96px - hero "Everything in one flow" */
--text-display-lg: 4.5rem; /* 72px */
--text-display-md: 3.5rem; /* 56px */

/* Headings */
--text-h1: 2.5rem;   /* 40px - section titles "Your daily finance flow" */
--text-h2: 2rem;     /* 32px - card titles */
--text-h3: 1.5rem;   /* 24px */
--text-h4: 1.25rem;  /* 20px */

/* Body */
--text-body-lg: 1.125rem;  /* 18px */
--text-body: 1rem;         /* 16px */
--text-body-sm: 0.875rem;  /* 14px */

/* Caption / labels */
--text-caption: 0.75rem;   /* 12px */
--text-overline: 0.6875rem; /* 11px uppercase */

/* Pesos */
--weight-regular: 400;
--weight-medium: 500;
--weight-semibold: 600;
--weight-bold: 700;
```

### 3.3 Estilos especiais

- **Hero ghost text:** Display XL em peso Bold, com cor `--ink-muted` e opacity 50% — para criar o efeito de "ghost text" sobreposto (como "Everything All in one")
- **Números monetários:** mono font com tabular-nums, fonte um pouco menor que o texto adjacente
- **Labels de categoria:** Caption em uppercase com tracking levemente positivo (`letter-spacing: 0.05em`)

---

## 4. Espaçamento e layout

### 4.1 Sistema de spacing (múltiplos de 4px)

```css
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
--space-12: 3rem;    /* 48px */
--space-16: 4rem;    /* 64px */
--space-24: 6rem;    /* 96px */
--space-32: 8rem;    /* 128px */
```

### 4.2 Container

```css
--container-max: 1280px;
--container-padding-mobile: 1.5rem;
--container-padding-desktop: 4rem;
```

### 4.3 Border radius

```css
--radius-sm: 0.5rem;    /* 8px - botões pequenos */
--radius-md: 0.75rem;   /* 12px - inputs */
--radius-lg: 1rem;      /* 16px - cards */
--radius-xl: 1.5rem;    /* 24px - cards de destaque, modais */
--radius-2xl: 2rem;     /* 32px - hero cards */
--radius-full: 999px;   /* pills, chips, círculos */
```

---

## 5. Sombras e elevação

```css
/* Cards */
--shadow-card: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04);
--shadow-card-hover: 0 4px 12px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.06);

/* Elevações maiores (modais, popovers) */
--shadow-elevated: 0 12px 24px rgba(0,0,0,0.08), 0 24px 60px rgba(0,0,0,0.08);

/* Inset / soft glow */
--shadow-soft-glow: 0 0 40px rgba(232, 197, 189, 0.3);
```

A sombra é sempre **suave, difusa, baixa opacidade**. Sem sombras duras ou drop-shadows agressivas.

---

## 6. Componentes essenciais

### 6.1 Botão primário (CTA)

```
Background: --ink-primary (preto)
Texto: --surface-white (branco)
Border-radius: --radius-full (pill) — para pequenos; --radius-md para grandes
Padding: 12px 24px (médio); 16px 32px (grande)
Font: Söhne Medium, 14-16px
Hover: leve scale (1.02) + sombra
```

### 6.2 Botão secundário

```
Background: --surface-white
Border: 1px solid rgba(0,0,0,0.08)
Texto: --ink-primary
Hover: background --bg-warm-haze
```

### 6.3 Cards

```
Background: --surface-white
Border-radius: --radius-xl (24px)
Padding: 24-32px
Shadow: --shadow-card
Border: opcional 1px solid rgba(0,0,0,0.04)
```

### 6.4 Card de categoria (com ícone)

```
Dimensões: ~120x120px ou retangular maior
Background: --surface-white
Ícone container: 56x56px, border-radius 14px, fundo em --accent-* pastel
Ícone interno: 24x24px em cor vibrant correspondente
Label: Caption uppercase abaixo
Sombra: soft
Hover: leve lift + sombra ampliada
```

### 6.5 Input

```
Background: --surface-white
Border: 1px solid rgba(0,0,0,0.08)
Border-radius: --radius-md
Padding: 12px 16px
Focus: border --ink-primary, shadow ring sutil
```

### 6.6 Pills / chips

```
Background: rgba(0,0,0,0.04) ou --bg-warm-haze
Texto: --ink-secondary
Border-radius: --radius-full
Padding: 6px 12px
Font: Caption Medium
```

### 6.7 Stat cards (números grandes)

```
Background: --surface-dark (preto profundo) OU --surface-white
Conteúdo: número grande em Display LG/MD
Label: Caption em --ink-tertiary acima ou abaixo
Cor de destaque: usar --vivid-orange ou --vivid-rose pra realçar
Border-radius: --radius-xl
Pode ter gradiente sutil radial ao fundo (laranja → rosa)
```

### 6.8 Faixa decorativa (hero)

Imagem de fundo de campos de capim-rosa ocupando topo e/ou base. Apenas a parte central tem fundo cream — laterais com a textura/imagem orgânica.

---

## 7. Iconografia

- **Estilo:** flat com personalidade, 24x24px padrão
- **Conjunto base:** Lucide ou Phosphor Icons
- **Ícones de categoria:** combinação de fundo pastel arredondado + ícone simples vibrante (emoji-like mas geometricamente desenhado)
- **Sem ícones outline finos em alta densidade.** Preferir bold ou filled

---

## 8. Imagens e elementos orgânicos

- **Fotografia:** natureza brasileira, luz natural, tons rosados/quentes
- **Mockups de celular:** sempre frontal, com sombra suave, em iPhones com bezels finos
- **Ilustrações:** evitar; preferir fotografia ou ícones
- **Texturas:** sutil grain/noise no fundo pode adicionar profundidade

---

## 9. Animações e micro-interações

```css
--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: 400ms cubic-bezier(0.4, 0, 0.2, 1);
```

- **Hover de card:** lift de 2-4px + sombra ampliada, transição smooth
- **Loading:** skeleton screens em cor `--bg-warm-haze`
- **Reveal on scroll:** fade in + translateY de 16px
- **Page transitions:** crossfade suave
- **Confirm action:** breve checkmark animado

---

## 10. Modo escuro (preparar pra V2)

Inversão principal:
```css
[data-theme="dark"] {
  --bg-primary: #0F0F0F;
  --bg-pink-soft: #1F1A1A;
  --surface-white: #1A1A1A;
  --surface-elevated: #252525;
  --ink-primary: #FAF6F2;
  --ink-secondary: #B4B4B4;
  --ink-tertiary: #6E6E6E;
  /* Acentos permanecem com leve dessaturação */
}
```

---

## 11. Layouts-chave

### 11.1 Landing page (estrutura)

1. **Nav superior** — logo Nosso Tudo + links + CTA "Começar grátis"
2. **Hero** — título display gigante com efeito ghost, frase de apoio, CTA, mockup central de celular com background orgânico (capim-rosa)
3. **Categorize / Funcionalidade 1** — título + 5 cards de categorias coloridos + bullets
4. **Funcionalidade 2** — múltiplos mockups de celular dispostos em arco
5. **Stats / Provas sociais** — 3 cards: features + número + uptime
6. **Testimonials** — depoimentos pequenos
7. **CTA final + App Store badges** — botões de download (futuro)
8. **Footer escuro** — links, newsletter, "© 2026 Nosso Tudo"

### 11.2 App — Home autenticada

1. **Topo** — Greeting "Bom dia, Nicolas" + avatar
2. **Card hero** — saúde financeira do mês (gradiente sutil)
3. **Carrossel de cartões** — utilização de limite
4. **Donut + lista** — gastos por categoria
5. **Coleções ativas** — cards horizontais (viagens em andamento, pedidos abertos)
6. **Alertas e próximos compromissos**
7. **Bottom nav mobile** (Home, Transações, Coleções, IA Chat, Perfil)

---

## 12. Princípios de uso

1. **Cor é sinal, não decoração.** Use cores acentuadas para chamar atenção; o fundo permanece neutro.
2. **Espaço é luxo.** Sempre que possível, mais respiro que mais conteúdo.
3. **Tipografia faz hierarquia, não bordas.** Headings grandes em peso forte; menos divisores.
4. **Sombras sussurram.** Nunca duras, sempre suaves e difusas.
5. **Movimento é confirmação, não exibicionismo.** Animações curtas, com propósito.
6. **Mobile é o canônico.** Desenhe pra 380px primeiro; expanda depois.

---

## 13. Próximos artefatos

- [ ] Tokens em formato Tailwind config (`tailwind.config.ts`)
- [ ] Componentes base no shadcn/ui customizados com esses tokens
- [ ] Landing page HTML/React funcional
- [ ] Storybook (futuro) com todos os componentes
- [ ] Guidelines de uso de cores específicas por tela
