// Forms from chat: the forms skill's command (src/forms/cli.ts) with this app's
// database. `--help` for usage.
import { formsCli } from "../src/forms/cli";
import { withDb } from "./migrate";

await formsCli(process.argv.slice(2), { withDb, source: "outreach", timeZone: "UTC" });
