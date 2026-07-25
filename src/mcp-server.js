// MCP over stdio — the entry point Claude Code spawns locally
// (claude mcp add docs -- node src/mcp-server.js). Tool definitions live in
// src/mcp.js; the web server exposes the same tools over HTTP at /mcp.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./mcp.js";

await buildServer().connect(new StdioServerTransport());
