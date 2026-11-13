// A visitor asks one company for a quote. The request is saved first, then goes to the
// address the company publishes, if the owner turned that on (SITE.md forward_leads) and an
// email sender can reach it. Pages are static, so a page's form asks here for its spam stamp.
import { Hono, type Context } from "hono";
import type { Child } from "hono/jsx";
import type { Db } from "./data/db";
import { envOf } from "./data/env";
import { afterResponse, emailsCustomers, sendEmail, teamAddresses } from "./data/send";
import { HONEYPOT, STAMP, makeStamp, verdict } from "./data/spam";
import { validate } from "./forms/fields";
import { insertOnce, loadForm, submitKey } from "./forms/store";
import { site } from "./shell";

export const LEAD_FORM = "quote";
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

type Listing = { slug: string; name: string; email: string | null };

async function listing(db: Db, slug: string): Promise<Listing | null> {
  const [row] = await db.sql<Listing>`select slug, name, email from listed_companies where slug = ${slug}`;
  return row ?? null;
}

const lines = (rows: [string, unknown][]) => rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");

/** Where it went, in the words the owner reads. Only what the company published and the visitor sent. */
async function pass(c: Context, db: Db, id: number, to: Listing, sub: { name: string | null; email: string | null; phone: string | null }, data: Record<string, unknown>): Promise<void> {
  const env = envOf(c);
  const request = lines([["Name", sub.name], ["Phone", sub.phone], ["Email", sub.email], ["ZIP code", data.zip], ["What they need", data.need]]);
  let said = "Held: forward_leads is off. Pass it on yourself";
  if (site.forwardLeads && !to.email) said = "Held: we have no email address for this company";
  else if (site.forwardLeads && !emailsCustomers(env)) said = "Held: no email sender is set up for businesses yet";
  else if (site.forwardLeads) {
    const sent = await sendEmail(env, {
      to: [to.email as string],
      replyTo: sub.email,
      subject: `Quote request for ${to.name} via ${site.name}`,
      text: `Someone looking at the page ${site.name} made for you asked you for a quote. Please reply to them directly.\n\n${request}\n\nIf this is the wrong address, or you'd rather not get these, reply and tell us.`,
    });
    said = sent.status === "sent" ? `Sent to ${to.email}` : `Not sent to ${to.email}: ${sent.status === "none" ? sent.why : sent.error.slice(0, 120)}`;
  }
  await db.sql`update submissions set notified = ${said} where id = ${id}::bigint`;
  const team = await teamAddresses(env);
  await sendEmail(env, { to: team, team: true, subject: `Quote request for ${to.name}`, text: `${said}.\n\n${request}` });
}

export function leadRoutes(getDb: (c: Context) => Db, hasDb: (c: Context) => boolean, shell: (path: string, heading: string, body: Child) => unknown) {
  const app = new Hono();
  app.use("/request/*", async (c, next) => (hasDb(c) ? next() : c.notFound()));

  app.get("/request/stamp", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ stamp: await makeStamp(LEAD_FORM) });
  });

  app.get("/request/thanks", async (c) => {
    const slug = c.req.query("c") ?? "";
    const to = SLUG.test(slug) ? await listing(getDb(c), slug) : null;
    return c.html(shell("/request/thanks", "Your request is saved", (
      <>
        <p class="text-lede text-ink-2">{to ? `We pass it on to ${to.name}. They reply to you directly.` : "They reply to you directly."} In a hurry? Calling is fastest.</p>
        {to ? <p class="mt-6"><a href={`/${to.slug}`} class="font-semibold">Back to {to.name}</a></p> : null}
      </>
    )) as string);
  });

  app.post("/request/:slug", async (c) => {
    const slug = c.req.param("slug");
    const back = `/${slug}`;
    if (!SLUG.test(slug)) return c.notFound();
    const input = Object.fromEntries(Object.entries(await c.req.parseBody()).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    const thanks = () => c.redirect(`/request/thanks?c=${slug}`, 303);
    const v = await verdict(LEAD_FORM, { honeypot: input[HONEYPOT], stamp: input[STAMP] });
    if (v === "drop") return thanks();
    const db = getDb(c);
    const [form, to] = await Promise.all([loadForm(db, LEAD_FORM), listing(db, slug)]);
    if (!form || !to) return c.notFound();
    const r = validate(form.fields, input);
    if (!r.ok) {
      return c.html(shell(back, "Please check your request", (
        <>
          <ul class="list-disc pl-5">{Object.values(r.errors).map((e) => <li>{e}</li>)}</ul>
          <p class="mt-6"><a href={`${back}#request`} class="font-semibold">Back to the form</a></p>
        </>
      )) as string, 422);
    }
    const data = { ...r.submission.data, company: to.slug, company_name: to.name };
    const { id, made } = await insertOnce(db, { ...r.submission, data, form_key: LEAD_FORM, source: "outreach", page: back, status: v === "spam" ? "spam" : "new" }, await submitKey(input[STAMP], r.submission));
    if (made && v === "ok") afterResponse(c, pass(c, db, id, to, r.submission, data));
    return thanks();
  });
  return app;
}
