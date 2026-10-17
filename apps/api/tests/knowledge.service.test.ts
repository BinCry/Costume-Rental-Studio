import { afterEach, describe, expect, it, vi } from 'vitest';

const { answerKnowledge } = await import('../src/modules/knowledge/knowledge.service.js');

const answerBody = {
  success: true,
  data: {
    result: {
      outcome: 'answered',
      answer: 'Return the costume on time.',
      sources: [
        {
          documentId: 'rental/order-lifecycle',
          heading: 'Return costume',
          citation: 'knowledge-base/rental/order-lifecycle.md#return-costume',
          domain: 'rental',
          status: 'approved',
          businessAuthority: true,
        },
      ],
      provisional: false,
    },
  },
  message: 'Knowledge answer completed',
};

const guestActor = { userId: 'guest', audiences: ['customer', 'shared'] as const };

afterEach(() => vi.unstubAllGlobals());

describe('knowledge service proxy', () => {
  it('forwards a trusted guest context without an authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(answerBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await answerKnowledge(
      { query: 'When should I return it?', topK: 5 },
      { actor: guestActor },
    );

    expect(result.outcome).toBe('answered');
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.get('X-AI-Service-Key')).toBe('test-ai-internal-key-at-least-32-characters');
    expect(headers.get('X-Actor-Id')).toBe('guest');
    expect(headers.get('X-Knowledge-Audiences')).toBe('customer,shared');
  });

  it('forwards trusted staff context without forwarding a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(answerBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await answerKnowledge(
      { query: 'How should staff handle this?', topK: 3 },
      {
        actor: { userId: 'staff-id', audiences: ['staff_internal', 'shared'] },
        requestId: 'request-1',
      },
    );

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.get('X-Actor-Id')).toBe('staff-id');
    expect(headers.get('X-Knowledge-Audiences')).toBe('staff_internal,shared');
    expect(headers.get('X-Request-Id')).toBe('request-1');
  });

  it('maps timeout, upstream rejection, and malformed success bodies to safe errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')),
    );
    await expect(
      answerKnowledge({ query: 'Valid question', topK: 5 }, { actor: guestActor }),
    ).rejects.toMatchObject({ statusCode: 504, code: 'AI_SERVICE_TIMEOUT' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    await expect(
      answerKnowledge({ query: 'Valid question', topK: 5 }, { actor: guestActor }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'AI_SERVICE_UNAVAILABLE' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await expect(
      answerKnowledge({ query: 'Valid question', topK: 5 }, { actor: guestActor }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'AI_SERVICE_INVALID_RESPONSE' });
  });

  it('rejects oversized bodies and maps a stalled body timeout correctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Length': '1000001' },
        }),
      ),
    );
    await expect(
      answerKnowledge({ query: 'Valid question', topK: 5 }, { actor: guestActor }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'AI_SERVICE_INVALID_RESPONSE' });

    const timedOutBody = new ReadableStream<Uint8Array>({
      pull() {
        throw new DOMException('Timed out', 'TimeoutError');
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(timedOutBody, { status: 200 })));
    await expect(
      answerKnowledge({ query: 'Valid question', topK: 5 }, { actor: guestActor }),
    ).rejects.toMatchObject({ statusCode: 504, code: 'AI_SERVICE_TIMEOUT' });
  });

  it.each([
    { label: 'no sources', sources: [] },
    {
      label: 'blank citation',
      sources: [{ ...answerBody.data.result.sources[0], citation: '   ' }],
    },
    {
      label: 'missing citation',
      sources: [{ ...answerBody.data.result.sources[0], citation: undefined }],
    },
    {
      label: 'incomplete source metadata',
      sources: [{ ...answerBody.data.result.sources[0], documentId: '  ' }],
    },
    {
      label: 'missing document ID',
      sources: [{ ...answerBody.data.result.sources[0], documentId: undefined }],
    },
    {
      label: 'missing heading',
      sources: [{ ...answerBody.data.result.sources[0], heading: undefined }],
    },
    {
      label: 'missing domain',
      sources: [{ ...answerBody.data.result.sources[0], domain: undefined }],
    },
    {
      label: 'missing status',
      sources: [{ ...answerBody.data.result.sources[0], status: undefined }],
    },
    {
      label: 'blank answer',
      sources: answerBody.data.result.sources,
      answer: '   ',
    },
  ])(
    'downgrades an answered response with $label to insufficient context',
    async ({ sources, answer }) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              ...answerBody,
              data: {
                result: {
                  ...answerBody.data.result,
                  sources,
                  ...(answer === undefined ? {} : { answer }),
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      );

      const result = await answerKnowledge(
        { query: 'When should I return it?', topK: 5 },
        { actor: guestActor },
      );

      expect(result.outcome).toBe('insufficient_context');
      expect(result.answer).toContain('nguồn trích dẫn hợp lệ');
      expect(result.sources).toEqual([]);
      expect(result.provisional).toBe(true);
    },
  );

  it('removes incomplete citations from an insufficient-context response', async () => {
    const firstSource = answerBody.data.result.sources[0];
    if (!firstSource) throw new Error('Expected the fixture to include a source.');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...answerBody,
            data: {
              result: {
                ...answerBody.data.result,
                outcome: 'insufficient_context',
                sources: [
                  firstSource,
                  { ...firstSource, citation: ' ' },
                ],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const result = await answerKnowledge(
      { query: 'When should I return it?', topK: 5 },
      { actor: guestActor },
    );
    expect(result.outcome).toBe('insufficient_context');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.citation).toBe(firstSource.citation);
  });
});
