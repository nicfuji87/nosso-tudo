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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-sage to-[#7A9580] p-5 text-brand-graphite shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-overline uppercase tracking-wide text-brand-graphite/55">Saldo do mês</p>
        <button
          type="button"
          onClick={toggle}
          aria-label={escondido ? "Mostrar saldo" : "Ocultar saldo"}
          className="-mr-1 rounded-full p-1.5 text-brand-graphite/55 transition-colors hover:bg-brand-graphite/10 hover:text-brand-graphite"
        >
          {escondido ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      <p
        className="mt-1 font-semibold leading-tight tracking-tight tabular-nums"
        style={{
          fontSize: "clamp(1.5rem, 7vw, 2.25rem)",
          color: escondido ? undefined : saldo < 0 ? "#8B2E2E" : "#15201A",
        }}
      >
        {mostra(saldo, { sign: true })}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-caption text-brand-graphite/55">Receitas</p>
          <p className="text-body font-medium tabular-nums">{mostra(receitas)}</p>
        </div>
        <div>
          <p className="text-caption text-brand-graphite/55">Despesas</p>
          <p className="text-body font-medium tabular-nums">{mostra(despesas)}</p>
        </div>
      </div>
    </div>
  );
}
