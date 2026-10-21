import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createProfile, deleteProfile, getPreferences, grantConsent } from './api';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const profile = {
  id: '12373736-c2c3-4394-8a5b-df5169fa5e08',
  templateKey: 'going_grey',
  consentCurrent: false,
  retention: 'standard',
  tone: 'warm',
  bodyPhotos: true,
  hasBaseline: false,
  extra: 'ignored',
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('posts to the same origin proxy and keeps only the fields it reads', async () => {
    fetchMock.mockResolvedValueOnce(json(profile, 201));
    const created = await createProfile({ templateKey: 'going_grey', ageConfirmed: true });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/profiles');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ templateKey: 'going_grey', ageConfirmed: true });
    expect(created).toEqual({ ...profile, extra: undefined });
    expect(created).not.toHaveProperty('extra');
  });

  it('rejects a response that is not a profile instead of passing it on', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'not-a-uuid' }));
    await expect(createProfile({ templateKey: 'going_grey', ageConfirmed: true })).rejects.toThrow();
  });

  it('reports a missing connection as a network error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(getPreferences('x')).rejects.toMatchObject({ name: 'ApiError', status: 'network' });
  });

  it('reports an answer that is not ok with its status', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Conflict' }, 409));
    const error = await grantConsent('x', {
      action: 'grant',
      version: '1',
      retention: 'standard',
      acceptStorage: true,
      acceptYoucam: true,
      acceptGemini: true,
      acceptOwnPhotosOnly: true,
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409 });
  });

  it('deletes with no body and accepts an empty answer', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteProfile('abc')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/profiles/abc');
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBeUndefined();
  });
});
