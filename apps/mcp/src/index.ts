import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Tools from docs/product/spec.md section 15. They will call the same services as the API.
const server = new McpServer({ name: 'interim', version: '0.0.0' });

const notImplemented = () => ({
  content: [{ type: 'text' as const, text: 'Not implemented yet' }],
  isError: true,
});

server.tool('create_profile', { template: z.string() }, notImplemented);
server.tool(
  'add_snapshot',
  { profile_id: z.string(), photos: z.array(z.string()) },
  notImplemented,
);
server.tool(
  'run_checkin',
  { profile_id: z.string(), snapshot_id: z.string() },
  notImplemented,
);
server.tool('get_stage_card', { run_id: z.string() }, notImplemented);
server.tool('eligible_tools', { snapshot_id: z.string() }, notImplemented);
server.tool('unit_ledger', { profile_id: z.string() }, notImplemented);

await server.connect(new StdioServerTransport());
