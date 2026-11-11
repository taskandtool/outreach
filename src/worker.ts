// The edge entry. Cloudflare serves everything under dist/ as static assets first
// (every pre-rendered page, the CSS, pictures); only what matches no asset reaches
// this: "/" by host, quote requests, visits and the 404 page. Bundled by `npm run build` to
// build/worker.mjs. Keep Node built-ins and src/data.ts out of what this imports.
import type { ExecutionContext } from "hono";
import app from "./public";

type Context = ExecutionContext & { props?: { tt?: unknown } };

export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: Context) {
    return app.fetch(request, { ...env, TT: ctx.props?.tt }, ctx);
  },
};
