import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailService } from './mail.service';

const message = { to: 'a@b.co', subject: 'Hello', text: 'plain', html: '<p>html</p>' };
const brevo = { mode: 'brevo', apiKey: 'key-1', fromEmail: 'hi@interim.test', fromName: 'Interim' } as const;

afterEach(() => vi.unstubAllGlobals());

describe('MailService', () => {
  it('sends through Brevo with the key, sender and both bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await new MailService(brevo).send(message);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers).toMatchObject({ 'api-key': 'key-1' });
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { name: 'Interim', email: 'hi@interim.test' },
      to: [{ email: 'a@b.co' }],
      subject: 'Hello',
      htmlContent: '<p>html</p>',
      textContent: 'plain',
    });
  });

  it('reports a Brevo refusal or a network failure as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(new MailService(brevo).send(message)).rejects.toThrow(ServiceUnavailableException);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(new MailService(brevo).send(message)).rejects.toThrow(ServiceUnavailableException);
  });

  it('sends nothing in log mode', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await new MailService({ ...brevo, mode: 'log' }).send(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
