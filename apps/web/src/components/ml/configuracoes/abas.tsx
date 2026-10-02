"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  // Links internos (ex.: Pinterest Copy → ?secao=publicacao#boards) mudam só a URL: segue a URL e rola até a âncora.
  const secaoUrl = useSearchParams().get("secao");
  useEffect(() => {
    if (!secaoUrl || !abas.some((a) => a.valor === secaoUrl)) return;
    setAtual(secaoUrl);
    const ancora = window.location.hash.slice(1);
    if (ancora) window.setTimeout(() => document.getElementById(ancora)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage só à mudança de seção na URL
  }, [secaoUrl]);
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
