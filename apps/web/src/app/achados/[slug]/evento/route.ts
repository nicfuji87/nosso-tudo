import { NextResponse, type NextRequest } from "next/server";
import { slugValido } from "@/lib/ml/paginas/regras";
import { contarEventoPagina } from "@/lib/ml/servicos/paginas";

/**
 * Contador de visita/clique das páginas públicas. Só aceita os dois tipos e slugs válidos,
 * só incrementa páginas publicadas (na RPC) e não guarda IP, cookie nem user agent.
 */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  if (!slugValido(params.slug)) return new NextResponse(null, { status: 404 });
  const corpo = (await req.text()).slice(0, 16).trim();
  if (corpo !== "visita" && corpo !== "clique") return new NextResponse(null, { status: 400 });
  // Robôs de pré-visualização não contam.
  if (/bot|crawler|spider|preview|pinterest/i.test(req.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  try {
    await contarEventoPagina(params.slug, corpo);
  } catch {
    /* contador nunca derruba a página */
  }
  return new NextResponse(null, { status: 204 });
}
