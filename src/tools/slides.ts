import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { requireAuth } from '../auth/oauth.js';
import { ResponseFormat } from '../types.js';
import { handleGoogleError } from '../utils/errors.js';
import { truncateIfNeeded } from '../utils/format.js';

function getSlides() {
  return google.slides({ version: 'v1', auth: requireAuth() });
}

export function registerSlidesTools(server: McpServer): void {
  // ─── google_slides_create ─────────────────────────────────────────────────
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

  // ─── google_slides_get ────────────────────────────────────────────────────
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

  // ─── google_slides_append_slides ──────────────────────────────────────────
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
