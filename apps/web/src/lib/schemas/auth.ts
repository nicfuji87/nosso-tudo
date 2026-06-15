import { z } from "zod";

const email = z.string().trim().toLowerCase().email("E-mail inválido");

// SR-001: mínimo 10 caracteres, mistura de tipos
const senhaForte = z
  .string()
  .min(10, "Use ao menos 10 caracteres")
  .regex(/[a-z]/, "Inclua uma letra minúscula")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula")
  .regex(/[0-9]/, "Inclua um número");

export const loginSchema = z.object({
  email,
  senha: z.string().min(1, "Informe sua senha"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const cadastroSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe seu nome").max(120),
    email,
    senha: senhaForte,
    confirmarSenha: z.string(),
    aceiteTermos: z.literal(true, {
      errorMap: () => ({ message: "Você precisa aceitar os termos" }),
    }),
  })
  .refine((d) => d.senha === d.confirmarSenha, {
    message: "As senhas não coincidem",
    path: ["confirmarSenha"],
  });
export type CadastroInput = z.infer<typeof cadastroSchema>;

export const esqueciSenhaSchema = z.object({ email });
export type EsqueciSenhaInput = z.infer<typeof esqueciSenhaSchema>;

export const redefinirSenhaSchema = z
  .object({
    senha: senhaForte,
    confirmarSenha: z.string(),
  })
  .refine((d) => d.senha === d.confirmarSenha, {
    message: "As senhas não coincidem",
    path: ["confirmarSenha"],
  });
export type RedefinirSenhaInput = z.infer<typeof redefinirSenhaSchema>;
