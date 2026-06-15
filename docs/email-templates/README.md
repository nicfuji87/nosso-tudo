# Templates de E-mail — Nosso Tudo

E-mails transacionais do Supabase Auth, na identidade visual da marca (grafite,
off-white, verde sálvia, azul petróleo). HTML table-based + estilos inline →
renderiza bem em Gmail, Outlook, Apple Mail e clientes mobile.

## Arquivos → onde colar

No **Supabase Dashboard → Authentication → Emails → Templates**, cole o conteúdo
de cada arquivo na aba correspondente:

| Arquivo | Aba no Supabase | Assunto sugerido |
|---|---|---|
| `01-confirmacao-cadastro.html` | **Confirm signup** | Confirme seu e-mail — Nosso Tudo |
| `02-redefinir-senha.html` | **Reset password** | Redefinir sua senha — Nosso Tudo |
| `03-magic-link.html` | **Magic link or OTP** | Seu link de acesso — Nosso Tudo |
| `04-convite.html` | **Invite user** | Você foi convidado — Nosso Tudo |
| `05-alterar-email.html` | **Change email address** | Confirme seu novo e-mail — Nosso Tudo |
| `06-reautenticacao.html` | **Reauthentication** | Código de verificação — Nosso Tudo |

Para cada um: cole o HTML no campo do template, ajuste o **Subject** e salve.

## Observações

- **Logo:** referenciado por URL absoluta `https://nossotudo.com.br/assets/logo/logo_dark_nt.png`
  (versão clara, sobre a faixa azul-grafite). Requer o site publicado nesse domínio.
- **Variável:** todos usam `{{ .ConfirmationURL }}`, o link de ação que o Supabase
  injeta em cada fluxo. Não trocar pelo `{{ .Token }}` (OTP numérico) a menos que
  você queira código em vez de link.
- **Botão:** cor do texto fixada em `#FFFFFF !important` para evitar o texto
  invisível que já apareceu no app.
- **Fonte:** Inter Tight via `@import` (Apple Mail/alguns clientes); fallback
  para sans-serif do sistema onde o import não carrega.
- A faixa superior usa `#1E2A3B` (Azul Grafite); botão em `#3D6D84` (Azul Petróleo);
  assinatura modular com os 3 blocos sálvia/petróleo/grafite.

## Configuração de remetente

Já está em uso `noreply@nossotudo.com.br` (confirmado em produção). O envio passa
pelo Resend (ver stack do projeto). Se trocar de provedor/domínio, validar SPF +
DKIM para não cair em spam.
