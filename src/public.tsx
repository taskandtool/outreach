// What needs a server: "/" by host, quote requests, visits and the 404 page. All the Worker
// carries, so it stays small whatever the number of companies. Web APIs only.
import { Hono, type Context } from "hono";
import type { Child } from "hono/jsx";
import { fromNeon } from "./data/neon";
import { envVar } from "./data/env";
import { leadRoutes } from "./leads";
import { visitRoutes } from "./visits";
import { Band, render, site } from "./shell";

const getDb = (c: Context) => fromNeon(envVar(c, "DATABASE_URL"));
const hasDb = (c: Context) => Boolean(envVar(c, "DATABASE_URL"));

const shell = (path: string, heading: string, body: Child) =>
  render(
    { path, title: heading, description: heading, index: false },
    <Band class="py-section">
      <h1 class="font-display text-display">{heading}</h1>
      <div class="mt-4 max-w-content">{body}</div>
    </Band>,
  );

const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

/** The company a host names: `larkspur-heating.<domain>` is larkspur-heating; the bare domain names none. */
export function companyOfHost(host: string, domain: string): string | null {
  const h = host.toLowerCase().split(":")[0];
  if (!domain || !h.endsWith(`.${domain}`)) return null;
  const sub = h.slice(0, -domain.length - 1);
  return SLUG.test(sub) && !sub.includes(".") && sub !== "www" ? sub : null;
}

const app = new Hono();

// Pages are static files; a company's subdomain asks its own host for the page by path, which this
// Worker's assets answer. Never the bare domain, which may be the agency's own site.
app.get("/", async (c) => {
  const slug = companyOfHost(new URL(c.req.url).host, site.domain);
  if (slug) {
    const page = await fetch(new URL(`/${slug}`, c.req.url));
    if (page.ok) return new Response(page.body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    return notFoundPage(c);
  }
  if (site.agencyUrl) return c.redirect(site.agencyUrl, 302);
  return c.html(shell("/", site.name, <p>Nothing to see here yet.</p>));
});

app.route("/", leadRoutes(getDb, hasDb, shell));
app.route("/", visitRoutes(getDb, hasDb));

export const notFoundPage = (c: Context) =>
  c.html(
    shell(
      "/404",
      "That page isn't here",
      <p>
        It may have moved, or the preview was taken down.{site.agencyUrl ? <> <a href={site.agencyUrl}>{site.name}</a> made these pages.</> : null}
      </p>,
    ),
    404,
  );
app.notFound(notFoundPage);

export default app;
