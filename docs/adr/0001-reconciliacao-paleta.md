# ADR 0001 — Reconciliação da paleta de cores

**Status:** aceito · **Data:** 2026-06-14

## Contexto

Há uma incoerência entre dois documentos de design:

- **`identidade-visual.md`** (manual de marca oficial — "toda decisão visual parte
  daqui") e o **PRD §11** definem a paleta oficial: Grafite `#111315`, Off White
  `#F7F6F2`, Verde Sálvia `#8FA993`, Azul Petróleo `#3D6D84`, Azul Grafite `#1E2A3B`.
  Os arquivos de logo (`public/assets/logo/`) confirmam essas cores.
- **`design-system.md`** ("Referência visual extraída da inspiração Traflow") usa uma
  paleta divergente, baseada em tons de **rosa/creme/blush** ("campos de capim-rosa").

As duas fontes se autodeclaram "fonte única de verdade", o que é contraditório.

## Decisão

A **marca oficial vence** para cor e identidade. Adotamos:

1. **Paleta primária** de `identidade-visual.md` (sálvia, petróleo, grafite, off-white)
   como tokens centrais — ver `globals.css` e `tailwind.config.ts`.
2. **Estrutura do `design-system.md`** (que é excelente e neutra de marca): escala
   tipográfica, espaçamentos, raios, sombras, animações, specs de componentes.
3. **Acentos pastéis** do design-system (mint, lavender, peach, etc.) mantidos **apenas**
   como fundos funcionais de ícones de categoria — não como cores de marca.
4. A atmosfera orgânica é recriada com **haze de sálvia/petróleo** (classe `.atmosphere`),
   substituindo o "capim-rosa", para honrar a direção serena/premium sem o rosa.

## Consequências

- Visual coeso com a marca e com os logos existentes.
- `design-system.md` deve ser atualizado futuramente para refletir a paleta oficial
  (hoje permanece como referência de estrutura).
- Dark mode já preparado com as cores de marca (identidade-visual §7).
