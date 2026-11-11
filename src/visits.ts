// A visit to a company's page, from the page's own beacon (static/site.js). `r` is the lead an
// email's link was made for, so a first visit after an email marks a warm lead
// (`node scripts/outreach.mjs visits`). Table: page_visits, made by scripts/migrate.ts. Edge-safe.
import { Hono, type Context } from "hono";
import type { Db } from "./data/db";

const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;
const REF = /^[A-Za-z0-9_-]{8,40}$/;

export function visitRoutes(getDb: (c: Context) => Db, hasDb: (c: Context) => boolean) {
  const app = new Hono();
  app.post("/visit/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!hasDb(c) || !SLUG.test(slug)) return c.body(null, 204);
    const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const ref = typeof body.r === "string" && REF.test(body.r) ? body.r : null;
    // Only a company we made a page for: anything else is someone poking at the address.
    await getDb(c).sql`insert into page_visits (slug, ref) select ${slug}, ${ref} where exists (select 1 from listed_companies where slug = ${slug})`.catch((e: unknown) => console.error("/visit: not saved:", e));
    return c.body(null, 204);
  });
  return app;
}
