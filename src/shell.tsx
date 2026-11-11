// The document around every page: head, the preview notice, footer. Runs at the edge
// too (the 404 and the request pages), so it reads no files. Pages supply what goes in <main>.
import { html, raw } from "hono/html";
import type { Child } from "hono/jsx";
import { googleFontsUrl } from "./fonts";
import siteJson from "./generated/site.json";

export const site = siteJson as { name: string; agencyUrl: string; domain: string; niche: string; noun: string; area: string; url: string; contactEmail: string; forwardLeads: boolean };

export type Page = {
  path: string;
  title: string;
  description: string;
  /** Every page here is false: a preview stays out of search. */
  index?: boolean;
  /** The company a page is for: the preview note and the footer name it. */
  company?: string;
};

/** The agency, linked where it is named. */
const Agency = () => (site.agencyUrl ? <a href={site.agencyUrl} class="underline">{site.name}</a> : <>{site.name}</>);

// Every page is a preview: never in search, so it never competes with the company's own site.
function Layout({ page, children }: { page: Page; children?: Child }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{page.title}</title>
        <meta name="description" content={page.description} />
        <meta property="og:title" content={page.title} />
        <meta property="og:description" content={page.description} />
        <meta property="og:type" content="website" />
        <meta name="robots" content="noindex, nofollow" />
        {googleFontsUrl ? (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
            <link rel="stylesheet" href={googleFontsUrl} />
          </>
        ) : null}
        <link rel="stylesheet" href="/site.css" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script src="/site.js" defer />
      </head>
      <body class="flex min-h-screen flex-col bg-canvas text-ink font-body">
        <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink">
          Skip to content
        </a>
        {page.company ? (
          <p class="bg-night px-5 py-2 text-center text-label text-night-ink-2">
            A preview <Agency /> made for {page.company} from its own website and reviews. Not {page.company}'s official site.
          </p>
        ) : null}
        <main id="main" class="grow pb-section">{children}</main>
        <footer class="bg-night text-night-ink-2">
          <div class="mx-auto max-w-wide px-5 py-8 sm:px-8">
            <p class="max-w-content">
              {page.company ? <>Made by <Agency /> from {page.company}'s public website and reviews. We haven't verified them, and {page.company}'s own terms decide what an offer or guarantee covers.</> : <Agency />}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

/** A full document for a page: the doctype plus the layout. */
export const render = (page: Page, body: Child) => html`<!doctype html>${raw(String(<Layout page={page}>{body}</Layout>))}`;

/** One band of the page, on the frame every band shares. */
export function Band({ children, class: cls = "" }: { children?: Child; class?: string }) {
  return <div class={`mx-auto max-w-wide px-5 sm:px-8 ${cls}`}>{children}</div>;
}
