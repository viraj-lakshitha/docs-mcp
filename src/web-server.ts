// Local entry point: runs the same Express app Vercel serves via api/index.ts.
import app from "./app.ts";
import { baseUrl } from "./db.ts";

const port = Number(process.env.PORT || 4680);
app.listen(port, () => {
  console.log(`Notes by Optiq Labs running on ${baseUrl()} (port ${port})`);
});
