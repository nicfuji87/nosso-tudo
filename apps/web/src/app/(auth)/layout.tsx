import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { AppPreview } from "@/components/marketing/app-preview";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Painel de marca (desktop) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-graphite p-12 lg:flex">
        <div className="atmosphere-soft absolute inset-0 opacity-30" />
        <Link href="/" className="relative w-fit" aria-label="Nosso Tudo — início">
          <Logo inverted />
        </Link>
        <div className="relative space-y-8">
          <blockquote className="max-w-md text-balance text-h3 font-medium tracking-tight text-brand-offwhite">
            “Isso virou o lugar onde minha família organiza tudo.”
          </blockquote>
          <div className="max-w-xs">
            <AppPreview />
          </div>
        </div>
        <p className="relative text-caption text-brand-offwhite/50">
          O sistema operacional da vida familiar.
        </p>
      </div>

      {/* Lado do formulário */}
      <div className="atmosphere flex flex-col">
        <div className="container flex items-center py-6 lg:hidden">
          <Link href="/" aria-label="Nosso Tudo — início">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
