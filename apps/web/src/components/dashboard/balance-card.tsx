"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { formatBRL } from "@/lib/format";

const KEY = "nt:saldo-oculto";
const MASK = "R$ ••••";

export function BalanceCard({
  saldo,
  receitas,
  despesas,
}: {
  saldo: number;
  receitas: number;
  despesas: number;
}) {
  const [oculto, setOculto] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
    setOculto(localStorage.getItem(KEY) === "1");
  }, []);

  function toggle() {
    setOculto((o) => {
      const n = !o;
      localStorage.setItem(KEY, n ? "1" : "0");
      return n;
    });
  }

  const escondido = montado && oculto;
  const mostra = (v: number, opts?: { sign?: boolean }) => (escondido ? MASK : formatBRL(v, opts));

  return (
    <div className="atmosphere-soft relative overflow-hidden rounded-2xl bg-brand-graphite p-6 text-brand-offwhite shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-overline uppercase tracking-wide text-brand-offwhite/50">Saldo do mês</p>
        <button
          type="button"
          onClick={toggle}
          aria-label={escondido ? "Mostrar saldo" : "Ocultar saldo"}
          className="-mr-1 rounded-full p-1.5 text-brand-offwhite/60 transition-colors hover:bg-brand-offwhite/10 hover:text-brand-offwhite"
        >
          {escondido ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      <p
        className="mt-1 font-semibold leading-none tracking-tight tabular-nums"
        style={{
          fontSize: "clamp(2rem, 9vw, 3rem)",
          color: escondido ? undefined : saldo >= 0 ? "#8FA993" : "#EF8A8A",
        }}
      >
        {mostra(saldo, { sign: true })}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <p className="text-caption text-brand-offwhite/50">Receitas</p>
          <p className="text-body-lg font-medium tabular-nums">{mostra(receitas)}</p>
        </div>
        <div>
          <p className="text-caption text-brand-offwhite/50">Despesas</p>
          <p className="text-body-lg font-medium tabular-nums">{mostra(despesas)}</p>
        </div>
      </div>
    </div>
  );
}
