// MCP over stdio — the entry point Claude Code spawns locally.
// Authentication: set DOCS_MCP_API_KEY to an API key created from the editor
// UI; all tools act as that key's user.
//   claude mcp add docs --env DOCS_MCP_API_KEY=dmcp_... -- node src/mcp-server.js
// Tool definitions live in src/mcp.js; the web app serves the same tools over
// HTTP at /mcp (with the key as a bearer token).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./mcp.js";
import { getUserIdForApiKey } from "./db.js";

const key = process.env.DOCS_MCP_API_KEY;
if (!key) {
  console.error("DOCS_MCP_API_KEY is not set. Create an API key from the editor UI and export it.");
  process.exit(1);
}
const userId = await getUserIdForApiKey(key);
if (!userId) {
  console.error("DOCS_MCP_API_KEY is invalid or has been revoked.");
  process.exit(1);
}

await buildServer(userId).connect(new StdioServerTransport());
