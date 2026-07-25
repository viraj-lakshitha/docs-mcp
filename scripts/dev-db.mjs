// Local development database: an in-process Postgres (PGlite) exposed over
// the wire protocol, so you can develop without touching your Neon database.
// Run `npm run dev:db`, then start the app with:
//   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres npm run web
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1" });
await server.start();
console.log("local dev Postgres (PGlite) listening on 127.0.0.1:5433");
