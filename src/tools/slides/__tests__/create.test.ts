import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadSlidesTools, registeredTools, mockPresentationsCreate } from './_setup.js';

describe('google_slides_create tool', () => {
  beforeEach(async () => {
    await loadSlidesTools();
    vi.clearAllMocks();
  });

  it('creates presentation and returns presentation_id and link', async () => {
    mockPresentationsCreate.mockResolvedValue({
      data: { presentationId: 'pres-1' },
    });

    const handler = registeredTools.get('google_slides_create')!;
    const result = (await handler({ title: 'My Deck' })) as {
      content: { type: string; text: string }[];
      structuredContent: { presentation_id: string; web_view_link: string };
    };

    expect(mockPresentationsCreate).toHaveBeenCalledWith({
      requestBody: { title: 'My Deck' },
    });
    expect(result.structuredContent.presentation_id).toBe('pres-1');
    expect(result.structuredContent.web_view_link).toContain('pres-1');
  });

  it('returns error on API failure', async () => {
    mockPresentationsCreate.mockRejectedValue(new Error('Invalid title'));

    const handler = registeredTools.get('google_slides_create')!;
    const result = (await handler({ title: 'Bad' })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
