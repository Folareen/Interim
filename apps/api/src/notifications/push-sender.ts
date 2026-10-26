import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';

/** Injection token for the push sender, so tests send to a fake instead of a push service. */
export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** Where and how to reach one device. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends one encrypted message to a device. */
export interface PushSender {
  /** The key the browser subscribes with, or null while push is not set up. */
  readonly publicKey: string | null;
  /** @returns `gone` when the push service says the subscription expired, so the caller deletes it. */
  send(target: PushTarget, payload: string): Promise<'sent' | 'gone'>;
}

export const VAPID_CONFIG = Symbol('VAPID_CONFIG');

/** The server's identity to push services. All three are empty while push is off. */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Sends through the push services with the server's VAPID identity. */
@Injectable()
export class WebPushSender implements PushSender {
  private readonly log = new Logger(WebPushSender.name);
  readonly publicKey: string | null;

  constructor(private readonly vapid: VapidConfig) {
    this.publicKey = vapid.publicKey || null;
  }

  async send(target: PushTarget, payload: string): Promise<'sent' | 'gone'> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        { vapidDetails: this.vapid, TTL: 6 * 60 * 60, urgency: 'normal' },
      );
      return 'sent';
    } catch (error) {
      const status = error instanceof webpush.WebPushError ? error.statusCode : undefined;
      if (status === 404 || status === 410) return 'gone';
      // The status only: the error body can echo the endpoint, which identifies a device.
      this.log.warn(`Push service answered ${status ?? 'with no response'}`);
      throw error;
    }
  }
}
