import Link from "next/link";
import { PackageX } from "lucide-react";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";

export default function ProdutoNaoEncontrado() {
  return (
    <EmptyState
      icon={PackageX}
      title="Produto não encontrado"
      description="Ele pode ter sido removido ou o endereço está incorreto."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/ml/produtos">Ver produtos</Link>
          </Button>
          <Button asChild variant="tech">
            <Link href="/ml/descobertas">Ir para Descobertas</Link>
          </Button>
        </div>
      }
    />
  );
}
