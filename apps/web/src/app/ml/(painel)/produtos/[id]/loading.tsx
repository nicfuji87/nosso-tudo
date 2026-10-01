import { Skeleton } from "@/components/ui/skeleton";

export default function Carregando() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando produto">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-9 w-96 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-12">
        <Skeleton className="aspect-square rounded-xl lg:col-span-5" />
        <div className="space-y-4 lg:col-span-7">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
