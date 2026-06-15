"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface MoneyInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  id?: string;
  autoFocus?: boolean;
  className?: string;
}

/** Campo monetário em BRL: digita "1234,56", entrega number 1234.56. */
export function MoneyInput({ value, onChange, id, autoFocus, className }: MoneyInputProps) {
  const [display, setDisplay] = React.useState(
    value != null ? value.toFixed(2).replace(".", ",") : "",
  );

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d,]/g, "");
    setDisplay(raw);
    if (!raw) {
      onChange(undefined);
      return;
    }
    const num = parseFloat(raw.replace(/\./g, "").replace(",", "."));
    onChange(Number.isNaN(num) ? undefined : num);
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-body-sm text-muted-foreground">
        R$
      </span>
      <input
        id={id}
        autoFocus={autoFocus}
        inputMode="decimal"
        value={display}
        onChange={handle}
        placeholder="0,00"
        className={cn(
          "tabular flex h-11 w-full rounded-md border border-input bg-card py-2 pl-10 pr-4 text-body-sm text-foreground transition-shadow placeholder:text-muted-foreground focus-visible:border-foreground/40 focus-visible:shadow-focus focus-visible:outline-none",
          className,
        )}
      />
    </div>
  );
}
