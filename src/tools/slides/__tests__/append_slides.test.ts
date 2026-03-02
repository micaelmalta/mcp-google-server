import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import {
  loadSlidesTools,
  registeredTools,
  mockPresentationsGet,
  mockPresentationsBatchUpdate,
} from './_setup.js';

describe('google_slides_append_slides tool', () => {
  beforeEach(async () => {
    await loadSlidesTools();
    vi.clearAllMocks();
  });

  it('appends slides and returns slide_count_added', async () => {
    mockPresentationsGet.mockResolvedValue({
      data: { presentationId: 'pres-1', slides: [{ objectId: 's0' }] },
    });
    mockPresentationsBatchUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_slides_append_slides')!;
    const result = (await handler({
      presentation_id: 'pres-1',
      slides: [{ title: 'New Slide', body: 'Content here' }],
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { slide_count_added: number; web_view_link: string };
    };

    expect(mockPresentationsGet).toHaveBeenCalledWith({
      presentationId: 'pres-1',
    });
    expect(mockPresentationsBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        presentationId: 'pres-1',
        requestBody: { requests: expect.any(Array) },
      })
    );
    expect(result.structuredContent.slide_count_added).toBe(1);
    expect(result.content[0].text).toContain('Added **1** slide');
  });

  it('returns error on API failure', async () => {
    mockPresentationsGet.mockRejectedValue(new Error('Not found 404'));

    const handler = registeredTools.get('google_slides_append_slides')!;
    const result = (await handler({
      presentation_id: 'bad',
      slides: [{ title: 'T' }],
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
