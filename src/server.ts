// The machine entry: static files, then the app. `npm run dev` runs this under a
// watcher beside the Tailwind watcher, so an edit is live on the next refresh.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import app from "./app";
import { notFoundPage } from "./public";
import { ROOT } from "./data";
import { relative } from "node:path";

const port = Number(process.env.PORT ?? 3000);
const server = new Hono();
// While the site is being built its files change: the browser asks again each time.
const fresh = (_path: string, c: Context) => c.header("Cache-Control", "no-cache");
server.use("/*", serveStatic({ root: "./static", onFound: fresh }));
// A sample's pictures, when SITE_ROOT keeps its working data apart from the code.
server.use("/media/*", serveStatic({ root: relative(process.cwd(), `${ROOT}/static`) || ".", onFound: fresh }));
server.route("/", app);
server.notFound(notFoundPage);

serve({ fetch: server.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`outreach listening on http://localhost:${info.port}`);
});
