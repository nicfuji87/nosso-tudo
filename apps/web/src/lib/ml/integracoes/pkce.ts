import { createHash, randomBytes } from "node:crypto";

/** PKCE S256 e state (puros — testados em oauth.test.ts). */
export const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function gerarPkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  return { verifier, challenge: desafioPkce(verifier) };
}

export function desafioPkce(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

export function gerarState(): string {
  return b64url(randomBytes(24));
}
