import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSlidesCreate } from './create.js';
import { registerSlidesGet } from './get.js';
import { registerSlidesAppendSlides } from './append_slides.js';

export function registerSlidesTools(server: McpServer): void {
  registerSlidesCreate(server);
  registerSlidesGet(server);
  registerSlidesAppendSlides(server);
}
