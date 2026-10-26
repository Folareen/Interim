import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LiveOffReason, type LiveSwitch, type RateLimiter, YoucamClient, type YoucamConfig } from './youcam.client';
import { YoucamError, taskErrorAction } from './youcam.errors';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fixturesDir: string;
const fetchMock = vi.fn<typeof fetch>();

function client(overrides: Partial<YoucamConfig> = {}) {
  return new YoucamClient({
    apiKey: 'key',
    baseUrl: 'https://yce.example.test',
    mode: 'live',
    liveCallsEnabled: true,
    fixturesDir,
    retryBaseMs: 1,
    ...overrides,
  });
}

beforeEach(async () => {
  fixturesDir = await mkdtemp(path.join(os.tmpdir(), 'youcam-'));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const densityBody = { src_file_id: 'f1' };
const densitySuccess = {
  status: 200,
  data: {
    task_status: 'success',
    error: null,
    results: { hair_density: { mapping: '2.16', term: 'Medium Density' } },
  },
};

describe('live switch', () => {
  it('refuses to send anything when live calls are off', async () => {
    const c = client({ liveCallsEnabled: false });
    await expect(c.createTask('hair_density', densityBody, 'k1')).rejects.toMatchObject({
      kind: 'live_disabled',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to send without an API key', async () => {
    const c = client({ apiKey: '' });
    await expect(c.createTask('hair_density', densityBody, 'k1')).rejects.toMatchObject({
      kind: 'auth',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const uploadInit = json({
  data: { files: [{ file_id: 'file-1', requests: [{ method: 'PUT', url: 'https://upload.example.test/x', headers: {} }] }] },
});

/** Stands in for the Redis switch: remembers a trip, and can be told it already tripped. */
function fakeSwitch(initial: LiveOffReason | null = null) {
  const state = { reason: initial };
  const live: LiveSwitch = {
    offReason: () => Promise.resolve(state.reason),
    trip: (reason) => {
      state.reason = reason;
      return Promise.resolve();
    },
  };
  return { live, state };
}

describe('shared rate limit', () => {
  it('waits for a slot before every request to YouCam, including each retry of a 429', async () => {
    const order: string[] = [];
    const limiter: RateLimiter = { acquire: () => Promise.resolve(void order.push('acquire')) };
    fetchMock.mockImplementation(() => {
      order.push('fetch');
      return Promise.resolve(order.filter((o) => o === 'fetch').length === 1 ? json({}, 429) : json({ data: { task_id: 't1' } }));
    });

    await client({ limiter }).createTask('hair_density', densityBody, 'k1');

    expect(order).toEqual(['acquire', 'fetch', 'acquire', 'fetch']);
  });

  it('does not count the upload to storage or the result download, which are other hosts', async () => {
    const acquire = vi.fn(() => Promise.resolve());
    fetchMock.mockResolvedValueOnce(uploadInit).mockResolvedValueOnce(new Response(null, { status: 200 }));

    await client({ limiter: { acquire } }).uploadPhoto({ bytes: new Uint8Array([1]), contentType: 'image/jpg', fileName: 'a.jpg' });

    expect(acquire).toHaveBeenCalledTimes(1); // the registration only
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when the limiter refuses, so a create is not left unknown', async () => {
    const limiter: RateLimiter = { acquire: () => Promise.reject(new YoucamError('rate_limited', 'queue too long')) };

    await expect(client({ limiter }).createTask('hair_density', densityBody, 'k1')).rejects.toMatchObject({ kind: 'rate_limited' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('automatic live switch', () => {
  it.each([
    ['a rejected key', json({ error_code: 'InvalidAccessToken' }, 401), 'auth'],
    ['no units left', json({ error_code: 'CreditInsufficiency' }, 400), 'out_of_units'],
  ] as const)('switches live calls off after %s', async (_name, response, reason) => {
    const { live, state } = fakeSwitch();
    fetchMock.mockResolvedValueOnce(response);

    await expect(client({ liveSwitch: live }).createTask('hair_density', densityBody, 'k1')).rejects.toMatchObject({ kind: reason });

    expect(state.reason).toBe(reason);
  });

  it('does not switch off for an error that is the request’s own fault', async () => {
    const { live, state } = fakeSwitch();
    fetchMock.mockResolvedValueOnce(json({ error_code: 'InvalidParameters' }, 400));

    await expect(client({ liveSwitch: live }).createTask('hair_density', densityBody, 'k1')).rejects.toMatchObject({ kind: 'invalid_request' });

    expect(state.reason).toBeNull();
  });

  it('refuses to upload or create once it is off, without a request', async () => {
    const { live } = fakeSwitch('out_of_units');
    const c = client({ liveSwitch: live });

    await expect(c.uploadPhoto({ bytes: new Uint8Array([1]), contentType: 'image/jpg', fileName: 'a.jpg' })).rejects.toMatchObject({ kind: 'live_disabled' });
    await expect(c.createTask('hair_density', densityBody, 'k1')).rejects.toMatchObject({ kind: 'live_disabled' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still polls a task that already exists, because that is free and settles its units', async () => {
    const { live } = fakeSwitch('out_of_units');
    fetchMock.mockResolvedValueOnce(json(densitySuccess));

    const status = await client({ liveSwitch: live }).getTask({ tool: 'hair_density', fixtureKey: 'k1', taskId: 't1' });

    expect(status.state).toBe('success');
  });
});

describe('live calls', () => {
  it('uploads in two steps and returns the file id', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          status: 200,
          data: {
            files: [
              {
                file_id: 'file-1',
                requests: [
                  {
                    method: 'PUT',
                    url: 'https://upload.example.test/x?sig=1',
                    headers: { 'Content-Type': 'image/jpg', 'Content-Length': 3 },
                  },
                ],
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const id = await client().uploadPhoto({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: 'image/jpg',
      fileName: 'a.jpg',
    });

    expect(id).toBe('file-1');
    const [, put] = fetchMock.mock.calls[1] ?? [];
    expect(put?.method).toBe('PUT');
    expect(put?.headers).toEqual({ 'Content-Type': 'image/jpg' });
  });

  it('creates a task at the versioned path with a bearer token', async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 200, data: { task_id: 't1' } }));
    const ref = await client().createTask(
      'hairstyle',
      { src_file_id: 'f1', template_id: 'tpl', hair_color: 'src' },
      'k1',
    );
    expect(ref).toEqual({ tool: 'hairstyle', fixtureKey: 'k1', taskId: 't1' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://yce.example.test/s2s/v2.1/task/hair-transfer');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer key' });
  });

  it('retries a 429 and then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ status: 429 }, 429))
      .mockResolvedValueOnce(json({ status: 200, data: { task_id: 't1' } }));
    const ref = await client().createTask('hair_density', densityBody, 'k1');
    expect(ref.taskId).toBe('t1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never re-sends a create after a 5xx and reports an unknown outcome', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 502));
    await expect(client().createTask('hair_density', densityBody, 'k1')).rejects.toMatchObject({
      kind: 'unknown_outcome',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a network failure on create as an unknown outcome', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(client().createTask('hair_density', densityBody, 'k1')).rejects.toMatchObject({
      kind: 'unknown_outcome',
    });
  });

  it('maps credit and key failures', async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 400, error_code: 'CreditInsufficiency' }, 400));
    await expect(client().createTask('hair_density', densityBody, 'k1')).rejects.toMatchObject({
      kind: 'out_of_units',
    });
    fetchMock.mockResolvedValueOnce(json({ status: 401, error_code: 'InvalidAccessToken' }, 401));
    await expect(client().createTask('hair_density', densityBody, 'k1')).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('rejects a body the tool does not accept before sending', async () => {
    await expect(
      // @ts-expect-error hair_color needs a preset
      client().createTask('hair_color', { src_file_id: 'f1' }, 'k1'),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses a running, a successful and a failed task', async () => {
    const ref = { tool: 'hair_density', fixtureKey: 'k1', taskId: 't1' } as const;
    fetchMock
      .mockResolvedValueOnce(json({ status: 200, data: { task_status: 'running' } }))
      .mockResolvedValueOnce(json(densitySuccess))
      .mockResolvedValueOnce(
        json({
          status: 200,
          data: { task_status: 'error', error: 'error_bald_image', error_message: 'bald' },
        }),
      );
    const c = client();
    expect(await c.getTask(ref)).toEqual({ state: 'running' });
    expect(await c.getTask(ref)).toEqual({
      state: 'success',
      result: { hair_density: { mapping: '2.16', term: 'Medium Density' } },
    });
    expect(await c.getTask(ref)).toEqual({
      state: 'error',
      code: 'error_bald_image',
      action: 'block_tool',
      message: 'bald',
    });
  });

  it('pages through feature costs', async () => {
    const sku = { description: 'd', amount: 2, unit: 'unit', proc_unit: 1, run_task_url: null };
    fetchMock
      .mockResolvedValueOnce(json({ status: 200, result: { next_token: 'n2', skus: [sku] } }))
      .mockResolvedValueOnce(json({ status: 200, result: { next_token: null, skus: [sku] } }));
    expect(await client().getFeatureCosts()).toHaveLength(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('starting_token=n2');
  });
});

describe('more tools', () => {
  const task = (results: unknown) => json({ status: 200, data: { task_status: 'success', results } });
  const ref = (tool: 'skin_tone' | 'face_shape' | 'makeup_brows') => ({ tool, fixtureKey: 'k', taskId: 't' });

  it('parses facial colour tones and tolerates colours the face does not have', async () => {
    fetchMock.mockResolvedValueOnce(
      task({ face_quality: { has_face: true, lighting: 'good' }, color: { skin_color: '#b9947c', eye_color_name: 'Brown' } }),
    );
    const status = await client().getTask(ref('skin_tone'));
    expect(status).toEqual({
      state: 'success',
      result: { face_quality: { has_face: true, lighting: 'good' }, color: { skin_color: '#b9947c', eye_color_name: 'Brown' } },
    });
  });

  it('only allows the face shape features, never age or gender', async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 200, data: { task_id: 't1' } }));
    await client().createTask('face_shape', { src_file_id: 'f1', features: ['faceShape'] }, 'k1');
    for (const feature of ['age', 'gender']) {
      const body = { src_file_id: 'f1', features: [feature] } as never;
      await expect(client().createTask('face_shape', body, 'k2')).rejects.toThrow();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends a colour only brow effect to makeup VTO', async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 200, data: { task_id: 't1' } }));
    await client().createTask(
      'makeup_brows',
      {
        src_file_id: 'f1',
        effects: [{ category: 'eyebrows', pattern: { type: 'color' }, palettes: [{ color: '#3b2f2f', colorIntensity: 60, texture: 'matte' }] }],
      },
      'k1',
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://yce.example.test/s2s/v2.0/task/makeup-vto');

    fetchMock.mockResolvedValueOnce(task({ url: 'https://cdn.example.test/a.jpg' }));
    expect(await client().getTask(ref('makeup_brows'))).toMatchObject({ state: 'success' });
  });

  it('reads the density grade as the live API spells it, with a negative mapping', async () => {
    fetchMock.mockResolvedValueOnce(
      task({ hair_density: { mapping: '-0.06', term: 'Extreme Low Density' }, timed: 3418 }),
    );
    const status = await client().getTask({ tool: 'hair_density', fixtureKey: 'k', taskId: 't' });
    expect(status).toEqual({ state: 'success', result: { hair_density: { mapping: '-0.06', term: 'Extreme Low Density' } } });
  });

  it('needs the version field for Fitzpatrick, which the docs page leaves out', async () => {
    const body = { src_file_id: 'f1' } as never;
    await expect(client().createTask('fitzpatrick', body, 'k1')).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(json({ status: 200, data: { task_id: 't1' } }));
    await client().createTask('fitzpatrick', { src_file_id: 'f1', version: '1.0' }, 'k1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats the queued and processing states as still running', async () => {
    for (const task_status of ['queued', 'processing']) {
      fetchMock.mockResolvedValueOnce(json({ status: 200, data: { task_status } }));
      expect(await client().getTask(ref('makeup_brows'))).toEqual({ state: 'running' });
    }
  });
});

describe('record and replay', () => {
  it('records a finished task without the signed link query and replays it offline', async () => {
    const result = {
      status: 200,
      data: {
        task_status: 'success',
        error: null,
        results: { url: 'https://cdn.example.test/out.jpg?X-Amz-Signature=secret' },
      },
    };
    fetchMock.mockResolvedValueOnce(json(result));
    const recorder = client({ mode: 'record' });
    await recorder.getTask({ tool: 'hair_color', fixtureKey: 'abc', taskId: 't1' });

    const saved = await readFile(path.join(fixturesDir, 'hair_color', 'abc.json'), 'utf8');
    expect(saved).not.toContain('secret');

    fetchMock.mockClear();
    const replayer = client({ mode: 'replay', liveCallsEnabled: false, apiKey: '' });
    const ref = await replayer.createTask(
      'hair_color',
      { src_file_id: 'x', preset: 'Jet Black' },
      'abc',
    );
    expect(await replayer.getTask(ref)).toEqual({
      state: 'success',
      result: { url: 'https://cdn.example.test/out.jpg' },
    });
    expect(
      await replayer.uploadPhoto({
        bytes: new Uint8Array(),
        contentType: 'image/png',
        fileName: 'a.png',
      }),
    ).toBe('replay-file');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not record a task that is still running', async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 200, data: { task_status: 'running' } }));
    await client({ mode: 'record' }).getTask({
      tool: 'hair_density',
      fixtureKey: 'r1',
      taskId: 't',
    });
    await expect(
      readFile(path.join(fixturesDir, 'hair_density', 'r1.json'), 'utf8'),
    ).rejects.toThrow();
  });

  it('fails closed on a missing fixture and never touches the network', async () => {
    const c = client({ mode: 'replay' });
    await expect(c.createTask('hair_density', densityBody, 'nope')).rejects.toMatchObject({
      kind: 'replay_missing',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects fixture keys that could leave the fixtures folder', async () => {
    const c = client({ mode: 'replay' });
    await mkdir(path.join(fixturesDir, 'hair_density'), { recursive: true });
    await writeFile(path.join(fixturesDir, 'x.json'), '{}');
    const error = await c.createTask('hair_density', densityBody, '../x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YoucamError);
  });
});

describe('task error actions', () => {
  it.each([
    ['error_hair_too_short', 'block_tool'],
    ['error_bald_image', 'block_tool'],
    ['error_no_face', 'new_photo'],
    ['error_insufficient_lighting', 'new_photo'],
    ['error_nsfw_content_detected', 'new_photo'],
    ['error_face_angle_upward', 'new_photo'],
    ['error_face_not_forward_facing', 'new_photo'],
    ['error_multi_person', 'new_photo'],
    ['error_invalid_src', 'new_photo'],
    ['error_apply_region_mismatch', 'block_tool'],
    ['error_editing_failed', 'block_tool'],
    ['error_invalid_ref', 'fault'],
    ['error_inference', 'fault'],
    ['something_new', 'fault'],
  ] as const)('%s -> %s', (code, action) => {
    expect(taskErrorAction(code)).toBe(action);
  });
});
