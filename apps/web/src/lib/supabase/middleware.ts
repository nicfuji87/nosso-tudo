import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rotas que exigem sessão autenticada. */
const PROTECTED_PREFIXES = ["/app", "/onboarding", "/ml"];
/** Rotas de autenticação que usuários logados não devem ver. */
const AUTH_ROUTES = ["/entrar", "/cadastrar"];
/**
 * Onde o GoTrue aterrissa quando recusa o `redirect_to` e cai no Site URL.
 * Nesses casos o `?code=` chega numa página que não sabe trocá-lo por sessão.
 */
const CALLBACK_FALLBACK_PATHS = ["/", "/entrar", "/cadastrar"];

/**
 * Repassa para o handler de callback um `?code=`/`token_hash` que aterrissou na
 * página errada. Rede de segurança: sem isso, uma allow-list de Redirect URLs
 * incompleta no Supabase faz o login "não pegar" na primeira tentativa.
 */
function resgatarCallback(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  if (!CALLBACK_FALLBACK_PATHS.includes(pathname)) return null;
  if (!searchParams.has("code") && !searchParams.has("token_hash")) return null;

  const url = request.nextUrl.clone();
  url.pathname = "/auth/callback";
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  const resgate = resgatarCallback(request);
  if (resgate) return resgate;

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Sem credenciais configuradas: deixa o site público funcionar; rotas
  // autenticadas exigirão o env preenchido (ver .env.example).
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: getUser() revalida o token no servidor (não confiar em getSession).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("redirect", pathname);
    return redirecionar(url, response);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.searchParams.delete("redirect");
    return redirecionar(url, response);
  }

  return response;
}

/**
 * Redireciona preservando os cookies que o Supabase escreveu em `response`
 * (o getUser pode ter rotacionado o token). Criar um NextResponse novo sem
 * copiá-los descarta a sessão renovada e derruba o usuário no login.
 */
function redirecionar(url: URL, response: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
