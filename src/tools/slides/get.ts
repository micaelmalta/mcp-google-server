import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSlides } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { truncateIfNeeded } from '../../utils/format.js';

export function registerSlidesGet(server: McpServer): void {
  server.registerTool(
    'google_slides_get',
    {
      title: 'Get Google Slides Presentation',
      description: `Retrieves metadata and slide content from a Google Slides presentation.

Args:
  - presentation_id: Presentation ID (from google_slides_create or Google Drive)
  - response_format: 'markdown' (slide summaries) or 'json' (full structure)

Returns:
  - title: Presentation title
  - slide_count: Number of slides
  - slides[]: Each slide's index, ID, and extracted text content`,
      inputSchema: z.object({
        presentation_id: z.string().min(1).describe('Presentation ID.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ presentation_id, response_format }) => {
      try {
        const slides = getSlides();
        const res = await slides.presentations.get({ presentationId: presentation_id });
        const pres = res.data;

        const slideData = (pres.slides ?? []).map((slide, index) => {
          const texts: string[] = [];
          for (const element of slide.pageElements ?? []) {
            if (element.shape?.text) {
              for (const run of element.shape.text.textElements ?? []) {
                if (run.textRun?.content) {
                  texts.push(run.textRun.content.trim());
                }
              }
            }
          }
          return {
            index: index + 1,
            slide_id: slide.objectId ?? '',
            text_content: texts.filter(Boolean).join('\n'),
          };
        });

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# ${pres.title ?? 'Untitled Presentation'}`, `${slideData.length} slides`, ''];
          for (const s of slideData) {
            lines.push(`## Slide ${s.index}`);
            lines.push(s.text_content || '*(No text content)*');
            lines.push('');
          }
          text = lines.join('\n');
        } else {
          text = JSON.stringify(
            {
              presentation_id: pres.presentationId,
              title: pres.title,
              slide_count: slideData.length,
              slides: slideData,
            },
            null,
            2
          );
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: {
            presentation_id: pres.presentationId,
            title: pres.title,
            slide_count: slideData.length,
            slides: slideData,
          },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
