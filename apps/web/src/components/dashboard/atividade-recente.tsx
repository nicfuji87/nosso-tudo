"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TransacaoItem } from "@/components/transacoes/transacao-item";
import { TransacaoEditSheet } from "@/components/transacoes/transacao-edit-sheet";
import { TransacaoSheet } from "./transacao-sheet";
import type { TransacaoComRelacoes } from "@/lib/types/db";

export function AtividadeRecente({ transacoes }: { transacoes: TransacaoComRelacoes[] }) {
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [editar, setEditar] = useState<string | null>(null);
  return (
    <>
      <Card>
        <CardContent className="divide-y divide-border/70 px-2 py-1 sm:px-3">
          {transacoes.map((tx) => (
            <button
              key={tx.id}
              type="button"
              onClick={() => setDetalhe(tx.id)}
              className="block w-full px-3 text-left transition-colors hover:bg-secondary/50"
            >
              <TransacaoItem tx={tx} />
            </button>
          ))}
        </CardContent>
      </Card>
      <TransacaoSheet
        id={detalhe}
        onClose={() => setDetalhe(null)}
        onEditar={(id) => {
          setDetalhe(null);
          setEditar(id);
        }}
      />
      <TransacaoEditSheet id={editar} onClose={() => setEditar(null)} />
    </>
  );
}
