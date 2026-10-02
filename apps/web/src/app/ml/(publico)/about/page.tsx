import type { Metadata } from "next";
import Link from "next/link";
import { CONTATO_EMAIL } from "../contato";

export const metadata: Metadata = {
  title: "About",
  description: "What Casa Prática is, what it is for and how it uses the Pinterest API.",
};

const API_USES = [
  {
    scope: "user_accounts:read",
    use: "Identify the connected account (ID, username and account type) to confirm the connection is active.",
  },
  {
    scope: "boards:read",
    use: "List the account's own boards to choose where each Pin will be published.",
  },
  {
    scope: "boards:write",
    use: "Create a new board on the account itself when the operator asks for it, to organize Pins by theme.",
  },
  {
    scope: "pins:write",
    use: "Publish approved Pins (image, title, description, alt text and link) to the chosen board.",
  },
  {
    scope: "pins:read",
    use: "Check the board's recent Pins to avoid publishing the same Pin twice, and read metrics for Pins published by the account itself.",
  },
];

export default function AboutPage() {
  return (
    <article className="container max-w-3xl py-16 lg:py-20">
      <p className="text-overline uppercase tracking-wide text-accent">About the app</p>
      <h1 className="mt-3 text-h1 font-semibold tracking-tight">Casa Prática</h1>
      <p className="mt-4 text-body-lg text-muted-foreground">
        Casa Prática curates useful products for the home and shares them on Pinterest as Pins with inspiration, usage
        tips and a link to the product page.
      </p>

      <div className="mt-12 space-y-10 text-body text-muted-foreground [&_h2]:text-h4 [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground">
        <section className="space-y-3">
          <h2>Purpose</h2>
          <p>
            Casa Prática is an in-house tool, run by a small team, to publish content to Casa Prática&apos;s own
            Pinterest account. It is not offered to the public and does not access other people&apos;s accounts.
          </p>
          <p>The workflow is:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>select home products available on Mercado Livre;</li>
            <li>
              prepare each Pin&apos;s creative — image, title, description and alt text — sometimes with the help of
              artificial intelligence, always labeled as such where Pinterest allows it;
            </li>
            <li>validate the content and, depending on the configuration, submit it for manual approval by an operator;</li>
            <li>publish the Pin to the appropriate board and track its performance over time.</li>
          </ol>
          <p>
            Pins lead to the product page on Mercado Livre through affiliate links: Casa Prática may earn a commission
            when someone buys through them, at no extra cost to the buyer.
          </p>
        </section>

        <section className="space-y-3">
          <h2>How we use the Pinterest API</h2>
          <p>
            The connection is made through Pinterest&apos;s official authorization flow (OAuth), started by the account
            owner. We only request the permissions needed for the workflow above:
          </p>
          <ul className="divide-y divide-border/70 rounded-xl border border-border/70 bg-card">
            {API_USES.map((u) => (
              <li key={u.scope} className="space-y-1 px-5 py-4">
                <code className="font-mono text-body-sm font-medium text-foreground">{u.scope}</code>
                <p className="text-body-sm">{u.use}</p>
              </li>
            ))}
          </ul>
          <p>
            For Pins published by the account itself, we also read aggregated performance metrics (impressions, saves,
            Pin clicks and outbound clicks). This tells us which topics and content formats work best.
          </p>
          <p>
            We do not read followers, messages, comments or other people&apos;s Pins, we do not publish to third-party
            accounts, and we do not sell or share data obtained from Pinterest. The app follows the{" "}
            <a
              href="https://policy.pinterest.com/developer-guidelines"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Pinterest Developer Guidelines
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2>Privacy and contact</h2>
          <p>
            Details on which data is accessed, where it is stored, for how long and how to request deletion are in the{" "}
            <Link href="/ml/privacy" className="font-medium text-foreground underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            . Questions, suggestions or reports about a Pin can be sent to{" "}
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
