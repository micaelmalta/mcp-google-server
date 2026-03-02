import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSlides } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerSlidesCreate(server: McpServer): void {
  server.registerTool(
    'google_slides_create',
    {
      title: 'Create a Google Slides Presentation',
      description: `Creates a new Google Slides presentation.

Args:
  - title: Presentation title (required)

Returns:
  - presentation_id: ID to use with google_slides_get
  - web_view_link: URL to open the presentation`,
      inputSchema: z.object({
        title: z.string().min(1).describe('Presentation title.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ title }) => {
      try {
        const slides = getSlides();
        const res = await slides.presentations.create({ requestBody: { title } });
        const presentationId = res.data.presentationId!;
        const webViewLink = `https://docs.google.com/presentation/d/${presentationId}/edit`;

        return {
          content: [
            {
              type: 'text',
              text: `Presentation created: **${title}**\n- ID: \`${presentationId}\`\n- [Open Presentation](${webViewLink})`,
            },
          ],
          structuredContent: { presentation_id: presentationId, title, web_view_link: webViewLink },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
