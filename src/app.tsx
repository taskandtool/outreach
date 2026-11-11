// Every page the build pre-renders, from data/: one per company, at /<slug>. Machine only:
// dev serves this, the build renders it to static files, and the Worker never bundles it.
// There is no home page file, so "/" always reaches the Worker (src/public.tsx), which
// sends the bare domain to the agency and a company's subdomain to its page.
import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { loadData } from "./data";
import { render, type Page } from "./shell";
import { companyPage, CompanyBody } from "./pages/company";
import publicApp from "./public";

export type Route = { page: Page; Body: FC };

export function routes(): Route[] {
  return loadData().companies.map((c) => ({ page: companyPage(c), Body: () => <CompanyBody c={c} /> }));
}

/** Crawling stays open so search engines see every page's noindex: a blocked page can still be indexed from links. */
export const robots = () => "User-agent: *\nAllow: /\n";

const app = new Hono();
// Routes are read per request in dev, so a rebuild of data/ shows on refresh.
app.use("*", async (c, next) => {
  if (c.req.method !== "GET") return next();
  const path = new URL(c.req.url).pathname;
  const route = routes().find((r) => r.page.path === path);
  if (route) return c.html(render(route.page, <route.Body />));
  if (path === "/robots.txt") return c.text(robots());
  return next();
});
app.route("/", publicApp);

export default app;
