import type { Request, Response } from 'express';
import { vi } from 'vitest';
import type { MailMessage, MailService } from '../mail/mail.service';

/** Records every email instead of sending it, so a test can read the link inside. */
export class FakeMail {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  asService(): MailService {
    return this as unknown as MailService;
  }

  /** The one use token in the last email sent. */
  lastToken(): string {
    const token = this.sent.at(-1)?.text.match(/token=([\w-]+)/)?.[1];
    if (!token) throw new Error('No emailed link to take a token from');
    return token;
  }
}

/** A response that remembers the cookies set on it. */
export function fakeRes() {
  const cookies = new Map<string, string>();
  const res = {
    cookie: vi.fn((name: string, value: string, _options?: object) => void cookies.set(name, value)),
    clearCookie: vi.fn((name: string) => void cookies.delete(name)),
  };
  return { res: res as unknown as Response, cookies, spies: res };
}

/** A request carrying these cookies. */
export function reqWith(cookies: Record<string, string> = {}): Request {
  return { cookies, headers: {} } as unknown as Request;
}
