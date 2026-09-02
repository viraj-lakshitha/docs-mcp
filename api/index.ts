// Vercel serverless entry — vercel.json rewrites all non-static routes here.
// This is the only backend file Vercel transpiles from .ts directly; it
// imports the already-compiled output of `npm run build:api` (see
// tsconfig.build.json), a real .js file on disk, so there's no dependency
// on Vercel's builder resolving a .ts source file for the app itself.
import app from "../dist/src/app.js";

export default app;
