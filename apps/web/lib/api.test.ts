import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  addStylePhoto,
  createProfile,
  createStyleRequest,
  deleteProfile,
  deleteReflection,
  dismissContacts,
  getPreferences,
  grantConsent,
  saveReflection,
  setStylePreviewSaved,
} from './api';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const profile = {
  id: '12373736-c2c3-4394-8a5b-df5169fa5e08',
  kind: 'situation',
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
    const created = await createProfile({ kind: 'situation', templateKey: 'going_grey', ageConfirmed: true });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/profiles');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ kind: 'situation', templateKey: 'going_grey', ageConfirmed: true });
    expect(created).toEqual({ ...profile, extra: undefined });
    expect(created).not.toHaveProperty('extra');
  });

  it('rejects a response that is not a profile instead of passing it on', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'not-a-uuid' }));
    await expect(createProfile({ kind: 'situation', templateKey: 'going_grey', ageConfirmed: true })).rejects.toThrow();
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

describe('reflections', () => {
  const reflection = { id: '12373736-c2c3-4394-8a5b-df5169fa5e08', text: 'A calm day', safety: 'none', createdAt: '2026-10-23T10:00:00.000Z' };

  it('saves a reflection and reads whether the contacts card should show', async () => {
    fetchMock.mockResolvedValueOnce(json({ reflection, contacts: true }, 201));
    const saved = await saveReflection('p1', 'A calm day');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/profiles/p1/reflections');
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'A calm day' });
    expect(saved.contacts).toBe(true);
    expect(saved.reflection.createdAt).toBeInstanceOf(Date);
  });

  it('reports a daily limit as a 429 the screen can tell apart', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Too many' }, 429));
    await expect(saveReflection('p1', 'again')).rejects.toMatchObject({ status: 429 });
  });

  it('deletes a reflection and dismisses the card', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await deleteReflection('p1', 'r1');
    await dismissContacts('p1');
    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`)).toEqual([
      'DELETE /api/profiles/p1/reflections/r1',
      'POST /api/profiles/p1/reflections/contacts/dismiss',
    ]);
  });

  it('starts previews with one current photo and the chosen references', async () => {
    const ids = { requestId: '8f14e45f-ceea-467a-9b3c-0a1d2e3f4a5b', runId: '9f14e45f-ceea-467a-9b3c-0a1d2e3f4a5b' };
    fetchMock.mockResolvedValueOnce(json(ids, 201));
    const current = '1f14e45f-ceea-467a-9b3c-0a1d2e3f4a5b';
    const reference = '2f14e45f-ceea-467a-9b3c-0a1d2e3f4a5b';

    expect(await createStyleRequest('p1', { currentPhotoId: current, referencePhotoIds: [reference] })).toEqual(ids);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/profiles/p1/style/requests');
    expect(JSON.parse(String(init?.body))).toEqual({ currentPhotoId: current, referencePhotoIds: [reference] });
  });

  it('rejects a style photo answer that is not a photo, and surfaces a capture problem', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'not-a-uuid' }));
    await expect(addStylePhoto('p1', { uploadId: '3f14e45f-ceea-467a-9b3c-0a1d2e3f4a5b', role: 'current' })).rejects.toThrow();

    fetchMock.mockResolvedValueOnce(json({ code: 'too_dark' }, 422));
    await expect(addStylePhoto('p1', { uploadId: '3f14e45f-ceea-467a-9b3c-0a1d2e3f4a5b', role: 'current' })).rejects.toMatchObject({
      status: 422,
      problem: { code: 'too_dark' },
    });
  });

  it('saves and unsaves a preview with PUT and DELETE', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await setStylePreviewSaved('v1', true);
    await setStylePreviewSaved('v1', false);
    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`)).toEqual([
      'PUT /api/style/previews/v1/saved',
      'DELETE /api/style/previews/v1/saved',
    ]);
  });
});
