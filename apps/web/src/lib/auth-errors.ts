/** Traduz mensagens do Supabase Auth para pt-BR amigável. */
export function traduzErroAuth(msg: string | undefined): string {
  const m = (msg ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Este e-mail já possui uma conta.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas. Tente novamente em alguns minutos.";
  if (m.includes("password")) return "Senha inválida. Use ao menos 10 caracteres.";
  if (m.includes("email")) return "E-mail inválido.";
  return "Algo deu errado. Tente novamente em instantes.";
}
