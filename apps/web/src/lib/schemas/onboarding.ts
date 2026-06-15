import { z } from "zod";

export const onboardingSchema = z.object({
  nomeWorkspace: z
    .string()
    .trim()
    .min(2, "Dê um nome ao seu espaço")
    .max(80, "Nome muito longo"),
  aceiteTermos: z.literal(true, {
    errorMap: () => ({ message: "Aceite os termos para continuar" }),
  }),
  aceitePrivacidade: z.literal(true, {
    errorMap: () => ({ message: "Aceite a política de privacidade" }),
  }),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;
