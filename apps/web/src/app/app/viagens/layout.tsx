import { ViagensAbas } from "@/components/viagens/viagens-abas";

export default function ViagensLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h1 className="text-h2 font-semibold tracking-tight">Viagens</h1>
        <ViagensAbas />
      </div>
      {children}
    </div>
  );
}
