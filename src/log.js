// Structured JSON logging: one line per event, always carrying a trace id
// (correlates every log line touched by a single HTTP request or MCP tool
// call) and the acting user id when known, so any action can be found from
// logs alone — grep for a trace id to see everything one request did, or a
// user id to see everything one account did.
const line = (event, fields) => JSON.stringify({ ts: new Date().toISOString(), event, ...fields });

export function log(event, fields = {}) {
  console.log(line(event, fields));
}

export function logError(event, fields = {}) {
  console.error(line(event, fields));
}
