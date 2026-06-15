import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Tokens do Nosso Tudo.
 * Cores referenciam variáveis CSS (canais RGB) definidas em globals.css,
 * permitindo modificadores de opacidade (ex.: bg-primary/80) e dark mode.
 */
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1.5rem", // design-system: mobile
        lg: "4rem", // desktop
      },
      screens: { "2xl": "1280px" }, // --container-max
    },
    extend: {
      colors: {
        background: rgb("--background"),
        "background-warm": rgb("--background-warm"),
        foreground: rgb("--foreground"),
        card: {
          DEFAULT: rgb("--card"),
          foreground: rgb("--card-foreground"),
        },
        popover: {
          DEFAULT: rgb("--popover"),
          foreground: rgb("--popover-foreground"),
        },
        primary: {
          DEFAULT: rgb("--primary"),
          foreground: rgb("--primary-foreground"),
        },
        secondary: {
          DEFAULT: rgb("--secondary"),
          foreground: rgb("--secondary-foreground"),
        },
        muted: {
          DEFAULT: rgb("--muted"),
          foreground: rgb("--muted-foreground"),
        },
        accent: {
          DEFAULT: rgb("--accent"),
          foreground: rgb("--accent-foreground"),
        },
        tech: {
          DEFAULT: rgb("--tech"),
          foreground: rgb("--tech-foreground"),
        },
        success: {
          DEFAULT: rgb("--success"),
          foreground: rgb("--success-foreground"),
        },
        warning: {
          DEFAULT: rgb("--warning"),
          foreground: rgb("--warning-foreground"),
        },
        destructive: {
          DEFAULT: rgb("--destructive"),
          foreground: rgb("--destructive-foreground"),
        },
        info: rgb("--info"),
        border: rgb("--border"),
        input: rgb("--input"),
        ring: rgb("--ring"),

        // Paleta oficial da marca (acesso direto quando necessário)
        brand: {
          graphite: rgb("--brand-graphite"),
          offwhite: rgb("--brand-offwhite"),
          sage: rgb("--brand-sage"),
          petroleum: rgb("--brand-petroleum"),
          "dark-blue": rgb("--brand-dark-blue"),
        },

        // Acentos pastéis para ícones de categoria (design-system §2.1) — funcionais
        pastel: {
          mint: "#C8E6C9",
          lavender: "#D4C5E8",
          peach: "#FFD4B8",
          rose: "#F5C2C7",
          sun: "#FFE4A8",
          sky: "#C9E2F0",
        },
        vivid: {
          green: "#4CAF50",
          orange: "#FF7043",
          rose: "#EC407A",
          purple: "#7E57C2",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Escala do design-system §3.2
        "display-xl": ["6rem", { lineHeight: "0.95", letterSpacing: "-0.04em", fontWeight: "700" }],
        "display-lg": ["4.5rem", { lineHeight: "0.98", letterSpacing: "-0.035em", fontWeight: "700" }],
        "display-md": ["3.5rem", { lineHeight: "1.02", letterSpacing: "-0.03em", fontWeight: "700" }],
        h1: ["2.5rem", { lineHeight: "1.1", letterSpacing: "-0.025em", fontWeight: "600" }],
        h2: ["2rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "600" }],
        h3: ["1.5rem", { lineHeight: "1.25", letterSpacing: "-0.015em", fontWeight: "600" }],
        h4: ["1.25rem", { lineHeight: "1.35", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6" }],
        body: ["1rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.55" }],
        caption: ["0.75rem", { lineHeight: "1.4" }],
        overline: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.08em", fontWeight: "600" }],
      },
      borderRadius: {
        sm: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        "2xl": "2rem",
        full: "999px",
      },
      boxShadow: {
        card: "0 1px 3px rgb(0 0 0 / 0.04), 0 4px 12px rgb(0 0 0 / 0.04)",
        "card-hover": "0 4px 12px rgb(0 0 0 / 0.06), 0 12px 32px rgb(0 0 0 / 0.06)",
        elevated: "0 12px 24px rgb(0 0 0 / 0.08), 0 24px 60px rgb(0 0 0 / 0.08)",
        "soft-glow": "0 0 40px rgb(143 169 147 / 0.25)",
        focus: "0 0 0 3px rgb(var(--ring) / 0.35)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "250ms",
        slow: "400ms",
      },
      maxWidth: {
        container: "1280px",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 400ms cubic-bezier(0.4,0,0.2,1) both",
        "fade-up": "fade-up 500ms cubic-bezier(0.4,0,0.2,1) both",
        "scale-in": "scale-in 250ms cubic-bezier(0.4,0,0.2,1) both",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
