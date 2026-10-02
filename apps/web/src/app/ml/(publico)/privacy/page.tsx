import type { Metadata } from "next";
import Link from "next/link";
import { CONTATO_EMAIL, POLITICA_VIGENCIA_EN } from "../contato";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Which Pinterest data Casa Prática accesses, why, where it is stored, for how long and how to request deletion.",
};

const DATA = [
  {
    item: "Account identification",
    detail: "Account ID, username, business name and account type (personal or business).",
    purpose: "Confirm which account is connected and that the connection is still valid.",
  },
  {
    item: "Access tokens",
    detail: "Access token and refresh token issued by Pinterest, with expiration dates and granted permissions.",
    purpose: "Make authorized API calls on behalf of the account itself.",
  },
  {
    item: "Boards",
    detail: "ID, name, description, visibility, Pin count, follower count and cover image of the account's boards.",
    purpose: "Choose which board each Pin will be published to.",
  },
  {
    item: "Published Pins",
    detail:
      "ID, URL and publication date of the Pins created by Casa Prática. The board's recent Pins are only checked, never stored.",
    purpose: "Keep a record of what was published and avoid duplicate posts.",
  },
  {
    item: "Pin metrics",
    detail: "Daily totals of impressions, saves, Pin clicks and outbound clicks for the account's own Pins.",
    purpose: "Measure content performance and decide what to publish next.",
  },
];

const RETENTION = [
  ["Access tokens", "Until disconnection or revocation of access; deleted immediately upon disconnection."],
  ["Account identification", "Until disconnection; removed together with the tokens."],
  ["Boards, published Pins and metrics", "While the integration is in use, to keep the performance history; deleted upon request or within 30 days after the app is shut down."],
  ["Technical API call logs", "30 days; deleted automatically by a weekly routine."],
  ["Temporary authorization (OAuth) state", "15 minutes; discarded after use or expiration."],
];

export default function PrivacyPage() {
  return (
    <article className="container max-w-3xl py-16 lg:py-20">
      <p className="text-overline uppercase tracking-wide text-accent">Pinterest integration</p>
      <h1 className="mt-3 text-h1 font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-body-sm text-muted-foreground">Effective {POLITICA_VIGENCIA_EN}</p>

      <div className="mt-10 space-y-10 text-body text-muted-foreground [&_h2]:text-h4 [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground">
        <section className="space-y-3">
          <h2>1. Scope of this policy</h2>
          <p>
            This policy describes how{" "}
            <Link href="/ml/about" className="font-medium text-foreground underline-offset-2 hover:underline">
              Casa Prática
            </Link>{" "}
            handles data obtained through the Pinterest API. Casa Prática is an in-house tool that publishes content to
            Casa Prática&apos;s own Pinterest account; only the owner of that account connects it, through
            Pinterest&apos;s official authorization flow (OAuth). We do not access other people&apos;s accounts.
          </p>
          <p>
            Processing follows Brazil&apos;s General Data Protection Law (LGPD, Law No. 13,709/2018) and the Pinterest
            Developer Guidelines.
          </p>
        </section>

        <section className="space-y-3">
          <h2>2. Which Pinterest data we access and why</h2>
          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
            <table className="w-full min-w-[34rem] text-left text-body-sm">
              <thead className="border-b border-border/70 text-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">What it includes</th>
                  <th className="px-4 py-3 font-semibold">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70 align-top">
                {DATA.map((d) => (
                  <tr key={d.item}>
                    <td className="px-4 py-3 font-medium text-foreground">{d.item}</td>
                    <td className="px-4 py-3">{d.detail}</td>
                    <td className="px-4 py-3">{d.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <strong className="font-semibold text-foreground">We do not access</strong> followers, follower lists,
            messages, comments, other people&apos;s Pins, ads data or payment information. Metrics are aggregated
            numbers provided by Pinterest and do not identify who viewed or clicked the Pins.
          </p>
          <p>
            Pinterest data is used exclusively to operate Casa Prática. We do not sell it, do not share it with third
            parties for advertising and do not use it to train artificial intelligence models.
          </p>
        </section>

        <section className="space-y-3">
          <h2>3. Where data is stored</h2>
          <p>
            Data is stored in a PostgreSQL database managed by{" "}
            <span className="font-medium text-foreground">Supabase</span>. Access tokens are kept separately, in
            Supabase&apos;s encrypted vault (Supabase Vault), and never in plain text in the app&apos;s tables. The app
            runs on <span className="font-medium text-foreground">Vercel</span>, which processes requests without
            storing this data permanently.
          </p>
        </section>

        <section className="space-y-3">
          <h2>4. How data is protected</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>all communication with Pinterest and with the database is encrypted in transit (HTTPS/TLS);</li>
            <li>data is encrypted at rest, and tokens get an additional layer of encryption in the vault;</li>
            <li>
              tokens are only read on the server, at the moment of each API call — they are never sent to the browser
              or shown in the interface;
            </li>
            <li>
              the operations dashboard requires login and is restricted to authorized members, with role-based access
              control and Row Level Security rules in the database;
            </li>
            <li>tokens, authorization headers and other credentials are automatically stripped from technical logs;</li>
            <li>sensitive administrative actions are recorded in an audit trail.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2>5. How long we keep data</h2>
          <dl className="divide-y divide-border/70 rounded-xl border border-border/70 bg-card">
            {RETENTION.map(([item, period]) => (
              <div key={item} className="grid gap-1 px-5 py-4 sm:grid-cols-[14rem_1fr] sm:gap-4">
                <dt className="font-medium text-foreground">{item}</dt>
                <dd className="text-body-sm">{period}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-3">
          <h2>6. How to revoke access and request deletion</h2>
          <p>At any time, you can:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="font-semibold text-foreground">Revoke access on Pinterest</strong> by removing Casa
              Prática from the connected apps in your Pinterest account&apos;s security settings. The tokens stop working
              immediately and no further API calls are possible.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Request data deletion</strong> by emailing{" "}
              <a href={`mailto:${CONTATO_EMAIL}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                {CONTATO_EMAIL}
              </a>{" "}
              with the subject “Pinterest data deletion” and the account&apos;s username. We reply within 15 days and
              complete the deletion of tokens, account identification, boards, Pin records and metrics within 30 days,
              with confirmation by email.
            </li>
          </ul>
          <p>
            Pins already published remain on your Pinterest account and can be deleted by you directly on Pinterest.
            Through the same channel you can also request access to, correction or portability of your data, as provided
            by the LGPD.
          </p>
        </section>

        <section className="space-y-3">
          <h2>7. Changes to this policy</h2>
          <p>
            If we change how Pinterest data is handled, this page will be updated and the effective date at the top
            will be changed before the change takes effect.
          </p>
        </section>

        <section id="contact" className="scroll-mt-24 space-y-3">
          <h2>8. Contact</h2>
          <p>
            For questions about this policy or about data handling, write to{" "}
            <a href={`mailto:${CONTATO_EMAIL}`} className="font-medium text-foreground underline-offset-2 hover:underline">
              {CONTATO_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
