import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSlides } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerSlidesAppendSlides(server: McpServer): void {
  server.registerTool(
    'google_slides_append_slides',
    {
      title: 'Append Slides with Content',
      description: `Adds one or more slides to an existing Google Slides presentation with title and optional body text.

Args:
  - presentation_id: Presentation ID (from google_slides_create or Google Drive)
  - slides: Array of { title, body? }. body supports newlines for bullet points.

Returns:
  - slide_count_added: Number of slides added
  - web_view_link: URL to open the presentation`,
      inputSchema: z
        .object({
          presentation_id: z.string().min(1).describe('Presentation ID.'),
          slides: z
            .array(
              z.object({
                title: z.string().describe('Slide title.'),
                body: z.string().optional().describe('Slide body text (newlines for bullets).'),
              })
            )
            .min(1)
            .max(20)
            .describe('Slides to append (title and optional body per slide).'),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ presentation_id, slides: slidesInput }) => {
      try {
        const slidesApi = getSlides();

        const getRes = await slidesApi.presentations.get({ presentationId: presentation_id });
        const currentCount = (getRes.data.slides ?? []).length;

        const requests: object[] = [];

        for (let i = 0; i < slidesInput.length; i++) {
          const slideId = `slide_${i}_${Date.now()}`;
          const titleId = `title_${i}_${Date.now()}`;
          const bodyId = `body_${i}_${Date.now()}`;

          requests.push({
            createSlide: {
              objectId: slideId,
              insertionIndex: currentCount + i,
              slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
              placeholderIdMappings: [
                { layoutPlaceholder: { type: 'TITLE', index: 0 }, objectId: titleId },
                { layoutPlaceholder: { type: 'BODY', index: 0 }, objectId: bodyId },
              ],
            },
          });
          requests.push({
            insertText: {
              objectId: titleId,
              text: slidesInput[i].title,
              insertionIndex: 0,
            },
          });
          requests.push({
            insertText: {
              objectId: bodyId,
              text: slidesInput[i].body ?? '',
              insertionIndex: 0,
            },
          });
        }

        await slidesApi.presentations.batchUpdate({
          presentationId: presentation_id,
          requestBody: { requests },
        });

        const webViewLink = `https://docs.google.com/presentation/d/${presentation_id}/edit`;

        return {
          content: [
            {
              type: 'text',
              text: `Added **${slidesInput.length}** slide(s) to the presentation.\n- [Open Presentation](${webViewLink})`,
            },
          ],
          structuredContent: {
            slide_count_added: slidesInput.length,
            web_view_link: webViewLink,
          },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
