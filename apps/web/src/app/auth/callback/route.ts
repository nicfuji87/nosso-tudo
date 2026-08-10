import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AUTH_NEXT_COOKIE, sanitizeNext } from "@/lib/auth-redirect";

/**
 * Handler único de retorno de auth: OAuth (Google), magic link, confirmação
 * de cadastro e recuperação de senha — todos via ?code= (PKCE) ou token_hash.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const cookieStore = cookies();
  // O destino chega por cookie (ver lib/auth-redirect). O `?next=` continua
  // aceito para links de e-mail já enviados antes desta mudança.
  const next = sanitizeNext(
    searchParams.get("next") ?? cookieStore.get(AUTH_NEXT_COOKIE)?.value,
    destinoPadrao(type),
  );

  // Atrás do proxy da Vercel, `origin` pode vir com o host interno; o
  // x-forwarded-host é o domínio que o usuário realmente está usando.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base =
    process.env.NODE_ENV === "development" || !forwardedHost
      ? origin
      : `https://${forwardedHost}`;

  const limparCookieNext = (res: NextResponse) => {
    res.cookies.set(AUTH_NEXT_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  // O provedor pode voltar com erro explícito (consentimento negado etc.).
  const erroProvedor = searchParams.get("error_description") ?? searchParams.get("error");
  if (erroProvedor) {
    return limparCookieNext(
      NextResponse.redirect(`${base}/entrar?erro=${encodeURIComponent(erroProvedor)}`),
    );
  }

  const supabase = createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return limparCookieNext(NextResponse.redirect(`${base}${next}`));
    return limparCookieNext(
      NextResponse.redirect(`${base}/entrar?erro=${encodeURIComponent(error.message)}`),
    );
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return limparCookieNext(NextResponse.redirect(`${base}${next}`));
    return limparCookieNext(
      NextResponse.redirect(`${base}/entrar?erro=${encodeURIComponent(error.message)}`),
    );
  }

  return limparCookieNext(NextResponse.redirect(`${base}/entrar?erro=link_invalido`));
}

/**
 * Sem cookie (link de e-mail aberto em outro navegador), o tipo do link já diz
 * para onde ir.
 */
function destinoPadrao(type: EmailOtpType | null): string {
  if (type === "recovery") return "/redefinir-senha";
  if (type === "signup" || type === "invite") return "/onboarding";
  return "/app";
}
