"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";

export function CopyField({
  label,
  value,
  mono = true,
}: {
  label?: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <div className="flex items-center gap-2">
        <code
          className={`min-w-0 flex-1 truncate rounded-md border border-input bg-secondary/40 px-3 py-2.5 text-body-sm ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </code>
        <Button type="button" variant="secondary" size="icon" onClick={copy} aria-label="Copiar">
          {copied ? <Check className="size-4 text-accent" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
