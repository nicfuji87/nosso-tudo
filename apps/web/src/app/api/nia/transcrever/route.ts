import { NextResponse } from "next/server";
import { resolveWorkspaceId } from "@/lib/auth";
import { transcrever } from "@/lib/nia/anexos";

export const runtime = "nodejs";

/**
 * Transcreve um áudio (gravação do microfone) e devolve o texto, sem persistir
 * o arquivo. O cliente joga o texto no campo de mensagem — o usuário revisa e
 * edita antes de enviar. Whisper requer a chave OpenAI (server-side).
 */
export async function POST(req: Request): Promise<Response> {
  const wk = await resolveWorkspaceId();
  if ("error" in wk) return NextResponse.json({ error: wk.error }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Áudio inválido." }, { status: 400 });
  }
  // Limite defensivo (Whisper aceita até 25MB; gravações curtas são bem menores).
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "Áudio muito longo." }, { status: 413 });
  }

  const nome = file instanceof File ? file.name : "audio.webm";
  const texto = await transcrever(file, nome);
  if (!texto) {
    return NextResponse.json(
      { error: "Não consegui transcrever o áudio. Tente de novo ou digite." },
      { status: 422 },
    );
  }
  return NextResponse.json({ texto });
}
