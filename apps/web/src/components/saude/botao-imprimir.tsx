"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BotaoImprimir() {
  return (
    <Button variant="accent" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" /> Imprimir / salvar PDF
    </Button>
  );
}
