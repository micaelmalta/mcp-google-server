import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadSlidesTools, registeredTools, mockPresentationsGet } from './_setup.js';

describe('google_slides_get tool', () => {
  beforeEach(async () => {
    await loadSlidesTools();
    vi.clearAllMocks();
  });

  it('returns presentation title and slide content in markdown', async () => {
    mockPresentationsGet.mockResolvedValue({
      data: {
        presentationId: 'pres-1',
        title: 'My Presentation',
        slides: [
          {
            objectId: 's1',
            pageElements: [
              {
                shape: {
                  text: {
                    textElements: [{ textRun: { content: 'Slide 1 Title' } }],
                  },
                },
              },
              {
                shape: {
                  text: {
                    textElements: [{ textRun: { content: 'Body text\n' } }],
                  },
                },
              },
            ],
          },
        ],
      },
    });

    const handler = registeredTools.get('google_slides_get')!;
    const result = (await handler({
      presentation_id: 'pres-1',
      response_format: 'markdown',
    })) as { content: { type: string; text: string }[]; structuredContent: { title: string; slide_count: number } };

    expect(result.content[0].text).toContain('My Presentation');
    expect(result.structuredContent.title).toBe('My Presentation');
    expect(result.structuredContent.slide_count).toBe(1);
  });

  it('returns error on API failure', async () => {
    mockPresentationsGet.mockRejectedValue(new Error('Presentation not found 404'));

    const handler = registeredTools.get('google_slides_get')!;
    const result = (await handler({
      presentation_id: 'bad',
      response_format: 'markdown',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
