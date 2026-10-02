import { Skeleton } from "@/components/ui/skeleton";

export default function Carregando() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando descobertas">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-80 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
