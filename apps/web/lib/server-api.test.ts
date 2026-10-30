import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLedger } from './server-api';

vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => 'interim_session=owner-session' }),
}));

const fetchMock = vi.fn<typeof fetch>();
const view = {
  entries: [
    {
      id: '12373736-c2c3-4394-8a5b-df5169fa5e08',
      runId: null,
      taskId: 'task-1',
      tool: 'hair_type',
      kind: 'settle',
      units: 2,
      createdAt: '2026-10-30T09:00:00.000Z',
    },
  ],
  totals: { reservedUnits: 0, settledUnits: 2 },
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('getLedger', () => {
  it('forwards the session without caching and validates the response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(view)));
    await expect(getLedger('profile/one')).resolves.toEqual(view);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/profiles/profile%2Fone/ledger'),
      {
        headers: { cookie: 'interim_session=owner-session' },
        cache: 'no-store',
      },
    );
  });

  it.each([400, 401, 404])('does not expose a ledger after an API %s', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(getLedger('private')).resolves.toBeUndefined();
  });

  it('rejects malformed totals rather than displaying a false zero', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ...view, totals: { reservedUnits: -1 } })),
    );
    await expect(getLedger('profile')).rejects.toThrow();
  });

  it('surfaces service failures instead of displaying an empty history', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(getLedger('profile')).rejects.toThrow('503');
  });
});
