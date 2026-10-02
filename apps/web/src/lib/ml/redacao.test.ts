import { describe, expect, it } from "vitest";
import { redigir, redigirTexto, urlSegura } from "./redacao";

describe("redação", () => {
  it("remove tokens conhecidos de texto livre", () => {
    const t = redigirTexto("Authorization: Bearer APP_USR-1234567890-abcdef e sk-proj-abcdefghijklmnopqrst");
    expect(t).not.toContain("APP_USR-1234567890");
    expect(t).not.toContain("sk-proj-abcdefghij");
    expect(t).toContain("[REDACTED]");
  });

  it("redige query params sensíveis mantendo o nome", () => {
    expect(redigirTexto("https://x.com/cb?code=TG-abc123456789xyz&state=ok")).toBe(
      "https://x.com/cb?code=[REDACTED]&state=ok",
    );
  });

  it("redige chaves sensíveis em objetos aninhados", () => {
    const r = redigir({
      headers: { Authorization: "Bearer abcdefghijkl", "Content-Type": "application/json" },
      body: { refresh_token: "xyz", board_id: "123", nested: [{ api_key: "k" }] },
    });
    expect(r.headers.Authorization).toBe("[REDACTED]");
    expect(r.headers["Content-Type"]).toBe("application/json");
    expect(r.body.refresh_token).toBe("[REDACTED]");
    expect(r.body.board_id).toBe("123");
    expect(r.body.nested[0]!.api_key).toBe("[REDACTED]");
  });

  it("urlSegura remove query e credenciais", () => {
    expect(urlSegura("https://user:pw@api.x.com/v5/pins?access_token=abc")).toBe("https://api.x.com/v5/pins");
  });
});
