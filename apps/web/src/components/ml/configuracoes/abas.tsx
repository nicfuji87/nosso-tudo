"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface Aba {
  valor: string;
  label: string;
  conteudo: React.ReactNode;
}

/** Abas sincronizadas com `?secao=` (troca instantânea; URL compartilhável). */
export function AbasConfiguracoes({ abas, inicial }: { abas: Aba[]; inicial: string }) {
  const [atual, setAtual] = useState(inicial);
  // Link interno para outra seção (ex.: ?secao=publicacao) com a página já aberta.
  useEffect(() => setAtual(inicial), [inicial]);
  return (
    <Tabs
      value={atual}
      onValueChange={(v) => {
        setAtual(v);
        const url = new URL(window.location.href);
        url.searchParams.set("secao", v);
        url.hash = "";
        window.history.replaceState(null, "", url.toString());
      }}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        <TabsList className="w-max">
          {abas.map((a) => (
            <TabsTrigger key={a.valor} value={a.valor}>
              {a.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {abas.map((a) => (
        <TabsContent key={a.valor} value={a.valor} forceMount className="mt-6 data-[state=inactive]:hidden">
          {a.conteudo}
        </TabsContent>
      ))}
    </Tabs>
  );
}
