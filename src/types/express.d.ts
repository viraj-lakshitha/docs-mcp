// Ambient augmentation: custom per-request fields set by our own middleware
// (src/auth.ts's requireAuth/requireApiAuth, src/app.ts's trace-id
// middleware) so every handler can read req.userId/req.traceId without a
// cast.
import "express";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
    traceId?: string;
  }
}
