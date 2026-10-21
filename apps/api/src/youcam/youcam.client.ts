import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type { YoucamMode } from '@interim/types';
import { z } from 'zod';
import { YoucamError, taskErrorAction, type TaskErrorAction } from './youcam.errors';
import { tools, type ToolName, type ToolRequest, type ToolResult } from './youcam.tools';

/** What the client is built from. `retryBaseMs` is the first wait after a 429 and doubles each time. */
export type YoucamConfig = {
  apiKey: string;
  baseUrl: string;
  mode: YoucamMode;
  liveCallsEnabled: boolean;
  fixturesDir: string;
  retryBaseMs: number; // first wait after a 429; doubles each time, with jitter
};

/** A normalised photo to upload. */
export type Photo = {
  bytes: Uint8Array;
  contentType: 'image/jpg' | 'image/png'; // the spelling used in the YouCam examples
  fileName: string;
};

/** What the caller keeps for an open task. `fixtureKey` is the call_cache key and names the fixture. */
export type TaskRef = { tool: ToolName; fixtureKey: string; taskId: string };

/** Where a task stands: still running, finished with a typed result, or failed with an action. */
export type TaskStatus<T extends ToolName> =
  | { state: 'running' }
  | { state: 'success'; result: ToolResult<T> }
  | { state: 'error'; code: string; action: TaskErrorAction; message: string | null };

const maxRetriesOn429 = 5;
const requestTimeoutMs = 30_000;

const fileInitSchema = z.object({
  data: z.object({
    files: z.tuple([
      z.object({
        file_id: z.string(),
        requests: z.tuple([
          z.object({
            method: z.string(),
            url: z.string().url(),
            headers: z.record(z.string(), z.union([z.string(), z.number()])),
          }),
        ]),
      }),
    ]),
  }),
});

const createSchema = z.object({ data: z.object({ task_id: z.string().min(1) }) });

const statusSchema = z.object({
  data: z.object({
    // Makeup VTO also reports `queued` and `processing`; all three mean not finished.
    task_status: z.enum(['running', 'queued', 'processing', 'success', 'error']),
    error: z.string().nullish(),
    error_message: z.string().nullish(),
    results: z.unknown().optional(),
  }),
});

// HTTP errors are { status, error, error_code }; CreditInsufficiency means out of units.
const httpErrorSchema = z.object({ error_code: z.string().optional() });

// Only batches whose type starts with `Api` can pay for a call.
const creditSchema = z.object({
  results: z.array(z.object({ type: z.string(), amount: z.number() })),
});

// Taken from the live API; the docs do not describe this response.
const featureCostSchema = z.object({
  result: z.object({
    next_token: z.string().nullish(),
    skus: z.array(
      z.object({
        description: z.string(),
        amount: z.number(),
        unit: z.string(),
        proc_unit: z.number().nullish(), // units of measure per charge, such as images; seen as a number in the live API
        run_task_url: z.string().nullish(),
      }),
    ),
  }),
});

/** One price from Get_Feature_Cost. */
export type FeatureCost = z.infer<typeof featureCostSchema>['result']['skus'][number];

/**
 * The only place that talks to YouCam (docs/integrations/youcam.md). It owns the YouCam steps
 * only: upload, create, poll, parse, record and replay. The ledger, task rows, cache and poll
 * queue call it and stay outside.
 */
@Injectable()
export class YoucamClient {
  readonly mode: YoucamMode;

  constructor(private readonly config: YoucamConfig) {
    this.mode = config.mode;
  }

  /** Uploads a photo and returns its YouCam file id, which expires after 24 hours. */
  async uploadPhoto(photo: Photo): Promise<string> {
    if (this.mode === 'replay') return 'replay-file';
    this.assertLive();

    const init = fileInitSchema.parse(
      await this.request('POST', '/s2s/v2.0/file', 'read', {
        files: [
          {
            content_type: photo.contentType,
            file_name: photo.fileName,
            file_size: photo.bytes.byteLength,
          },
        ],
      }),
    );
    const [file] = init.data.files;
    const [target] = file.requests;

    // fetch sets Content-Length from the body.
    const headers = Object.fromEntries(
      Object.entries(target.headers)
        .filter(([name]) => name.toLowerCase() !== 'content-length')
        .map(([name, value]) => [name, String(value)]),
    );
    const response = await this.send(target.method, target.url, headers, photo.bytes, 'read');
    if (!response.ok) throw new YoucamError('transient', `Upload failed with ${response.status}`);
    return file.file_id;
  }

  /**
   * Creates a task. Never call it twice for one logical task: YouCam has no idempotency key.
   * @throws YoucamError of kind `unknown_outcome` when the task may exist; leave its row `unknown` and reconcile.
   */
  async createTask<T extends ToolName>(
    tool: T,
    body: ToolRequest<T>,
    fixtureKey: string,
  ): Promise<TaskRef> {
    if (this.mode === 'replay') {
      await this.readFixture(tool, fixtureKey); // fail closed now rather than at the first poll
      return { tool, fixtureKey, taskId: `replay:${fixtureKey}` };
    }
    this.assertLive();

    const definition = tools[tool];
    const payload = definition.request.parse(body);
    const created = createSchema.parse(
      await this.request(
        'POST',
        `/s2s/${definition.version}/task/${definition.path}`,
        'create',
        payload,
      ),
    );
    return { tool, fixtureKey, taskId: created.data.task_id };
  }

  /** Reads a task's state. A task that failed arrives inside an HTTP 200 and is returned as `error`, not thrown. */
  async getTask<T extends ToolName>(ref: TaskRef & { tool: T }): Promise<TaskStatus<T>> {
    const definition = tools[ref.tool];
    let raw: string;
    if (this.mode === 'replay') {
      raw = await this.readFixture(ref.tool, ref.fixtureKey);
    } else {
      this.assertLive();
      raw = await this.requestText(
        'GET',
        `/s2s/${definition.version}/task/${definition.path}/${encodeURIComponent(ref.taskId)}`,
        'read',
      );
    }

    const { data } = statusSchema.parse(JSON.parse(raw));
    if (data.task_status !== 'success' && data.task_status !== 'error') return { state: 'running' };
    if (this.mode === 'record') await this.writeFixture(ref.tool, ref.fixtureKey, raw);
    if (data.task_status === 'error') {
      const code = data.error ?? 'unknown_internal_error';
      return {
        state: 'error',
        code,
        action: taskErrorAction(code),
        message: data.error_message ?? null,
      };
    }
    return { state: 'success', result: definition.result.parse(data.results) as ToolResult<T> };
  }

  /** Units the API key can still spend. Free, live only. */
  async getSpendableUnits(): Promise<number> {
    this.assertLive();
    const credit = creditSchema.parse(await this.request('GET', '/s2s/v1.0/client/credit', 'read'));
    return credit.results.filter((batch) => batch.type.startsWith('Api')).reduce((sum, batch) => sum + batch.amount, 0);
  }

  /** One page of a template list such as `hair-transfer`. Free, live only. The response shape is unvalidated, so the spike prints it raw. */
  async getTemplatePage(feature: string, version: string, startingToken?: string): Promise<unknown> {
    this.assertLive();
    const query = startingToken ? `&starting_token=${encodeURIComponent(startingToken)}` : '';
    return this.request('GET', `/s2s/${version}/task/template/${encodeURIComponent(feature)}?page_size=20${query}`, 'read');
  }

  /** Every price YouCam lists. Live only: replay has no cost fixture, so use `unitCosts`. */
  async getFeatureCosts(): Promise<FeatureCost[]> {
    this.assertLive();
    const costs: FeatureCost[] = [];
    let token: string | null | undefined;
    do {
      const query = token ? `&starting_token=${encodeURIComponent(token)}` : '';
      const page = featureCostSchema.parse(
        await this.request('GET', `/s2s/v2.0/credit/feature-cost?page_size=20${query}`, 'read'),
      );
      costs.push(...page.result.skus);
      token = page.result.next_token;
    } while (token);
    return costs;
  }

  // Record spends units like live, so both need the switch.
  private assertLive(): void {
    if (!this.config.liveCallsEnabled) {
      throw new YoucamError('live_disabled', 'LIVE_CALLS_ENABLED is not true');
    }
    if (!this.config.apiKey) throw new YoucamError('auth', 'YOUCAM_API_KEY is not set');
  }

  // `create` marks the one call that must never be repeated after an unclear failure.
  private async request(
    method: 'GET' | 'POST',
    route: string,
    intent: 'create' | 'read',
    body?: unknown,
  ): Promise<unknown> {
    return JSON.parse(await this.requestText(method, route, intent, body));
  }

  private async requestText(
    method: 'GET' | 'POST',
    route: string,
    intent: 'create' | 'read',
    body?: unknown,
  ): Promise<string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.config.apiKey}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.send(
      method,
      new URL(route, this.config.baseUrl).toString(),
      headers,
      body === undefined ? undefined : JSON.stringify(body),
      intent,
    );
    const text = await response.text();
    if (response.ok) return text;
    throw this.httpError(response.status, text, intent);
  }

  // Retries only a 429, which means no task was created. YouCam sends no Retry-After, so the wait doubles with jitter.
  private async send(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | Uint8Array | undefined,
    intent: 'create' | 'read',
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
      } catch (cause) {
        const message = `${method} ${new URL(url).pathname} did not complete`;
        throw new YoucamError(intent === 'create' ? 'unknown_outcome' : 'transient', message, {
          cause,
        });
      }
      if (response.status !== 429 || attempt >= maxRetriesOn429) return response;
      await response.body?.cancel();
      const wait = this.config.retryBaseMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, wait + Math.random() * wait));
    }
  }

  private httpError(status: number, text: string, intent: 'create' | 'read'): YoucamError {
    if (status === 401 || status === 403)
      return new YoucamError('auth', `YouCam returned ${status}`);
    if (status === 429) return new YoucamError('rate_limited', 'YouCam rate limit still exceeded');
    if (status >= 500) {
      return new YoucamError(
        intent === 'create' ? 'unknown_outcome' : 'transient',
        `YouCam returned ${status}`,
      );
    }
    let errorCode: string | undefined;
    try {
      errorCode = httpErrorSchema.parse(JSON.parse(text)).error_code;
    } catch {
      // Not the usual error body; the raw text is reported below.
    }
    if (errorCode === 'CreditInsufficiency') {
      return new YoucamError('out_of_units', 'YouCam account is out of units');
    }
    return new YoucamError('invalid_request', `YouCam returned ${status}: ${text.slice(0, 300)}`);
  }

  private fixturePath(tool: ToolName, fixtureKey: string): string {
    // The key becomes a file name.
    if (!/^[A-Za-z0-9_-]+$/.test(fixtureKey)) {
      throw new YoucamError('invalid_request', 'Fixture key has unsupported characters');
    }
    return path.join(this.config.fixturesDir, tool, `${fixtureKey}.json`);
  }

  private async readFixture(tool: ToolName, fixtureKey: string): Promise<string> {
    const file = this.fixturePath(tool, fixtureKey);
    try {
      return await readFile(file, 'utf8');
    } catch (cause) {
      throw new YoucamError('replay_missing', `No recorded fixture at ${file}`, { cause });
    }
  }

  // Result links carry a signature in the query string, so it is cut before saving.
  private async writeFixture(tool: ToolName, fixtureKey: string, raw: string): Promise<void> {
    const file = this.fixturePath(tool, fixtureKey);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, raw.replace(/("https?:\/\/[^"?]*)\?[^"]*"/g, '$1"'));
  }
}
