import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/** One email. Both bodies are sent so clients that block HTML still show the link. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** `log` prints mail to the console for local work; `brevo` sends it. Production must use `brevo`. */
export interface MailConfig {
  mode: 'log' | 'brevo';
  apiKey: string;
  fromEmail: string;
  fromName: string;
}
export const MAIL_CONFIG = Symbol('MAIL_CONFIG');

const BREVO_SEND = 'https://api.brevo.com/v3/smtp/email';

/** Sends transactional email through Brevo, the only place Interim emails a person from. */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);

  constructor(@Inject(MAIL_CONFIG) private readonly config: MailConfig) {}

  /**
   * Sends one message.
   * @throws ServiceUnavailableException when Brevo does not accept it.
   */
  async send(message: MailMessage): Promise<void> {
    if (this.config.mode === 'log') {
      this.log.log(`mail to ${message.to}: ${message.subject}\n${message.text}`);
      return;
    }
    let response: Response;
    try {
      response = await fetch(BREVO_SEND, {
        method: 'POST',
        headers: { 'api-key': this.config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: this.config.fromName, email: this.config.fromEmail },
          to: [{ email: message.to }],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
        }),
      });
    } catch {
      throw new ServiceUnavailableException('Mail could not be sent');
    }
    if (!response.ok) {
      this.log.error(`Brevo answered ${response.status}`);
      throw new ServiceUnavailableException('Mail could not be sent');
    }
  }
}
