# ADR 0002 — Estrutura do app e tooling

**Status:** aceito · **Data:** 2026-06-14

## Contexto

- O PRD §8.2 especifica um monorepo **pnpm + Turborepo** com vários `packages/`.
- O projeto está em um drive **`D:` formatado como exFAT**, que **não suporta symlinks**
  nem hardlinks — o linker padrão do pnpm falha (`ERR_PNPM_EISDIR`).
- É greenfield; a prioridade imediata é entregar software que **compila e roda**.

## Decisão

1. **App único Next.js** em `apps/web` (App Router, TypeScript strict), em vez do
   monorepo Turborepo completo nesta fase. A organização interna espelha os packages
   pretendidos para extração futura:
   - `src/lib/` → `schemas/` (Zod), `db/` (queries), `types/` (enums/linhas),
     `supabase/` (clientes), utilitários — equivale a `packages/{schemas,db,types,...}`.
   - `src/components/ui` + `src/components/patterns` → equivale a `packages/ui`.
2. **Tailwind v3 com `tailwind.config.ts`** (não v4), pois o próprio design-system pede
   "tokens em formato `tailwind.config.ts`" e a v3 é mais estável aqui.
3. **`node-linker=hoisted`** no `.npmrc` (node_modules plano), contornando a limitação do
   exFAT.
4. **Next.js 14 + React 18** (o PRD pede "Next.js 14+"), por máxima compatibilidade do
   ecossistema (Recharts, Radix, react-hook-form).

## Consequências

- Build confiável no ambiente atual; caminho claro para virar monorepo depois
  (mover `src/lib/*` e `src/components/{ui,patterns}` para `packages/`).
- Edge Functions do Supabase (PRD §9.2) ainda não implementadas — ficam para as fases
  3–5 (WhatsApp, IA, Asaas, conciliação), que dependem de serviços externos.
- O acesso ao banco hoje usa o cliente Supabase com RLS direto do app; a lógica de
  domínio fica centralizada em `src/lib/db` para reuso futuro nas Edge Functions.
