import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Channel, InboundMessage, MessageKind } from '@nexus/contracts';

/**
 * @nexus/channels — adaptateurs de messagerie au contrat commun.
 *
 * Règles non négociables :
 * - WhatsApp : Cloud API officielle uniquement (signature `x-hub-signature-256`).
 * - Telegram : Bot API officielle (secret webhook en en-tête `x-telegram-bot-api-secret-token`).
 * - Mock : RÉEL pour les tests — même contrat, aucun réseau.
 * - Aucun adaptateur ne persiste le contenu : il ne fait que normaliser.
 *
 * Statuts à l'instant :
 * - mock    : RÉEL (exécuté et testé en CI).
 * - telegram: code RÉEL — exécution réseau BLOCKED (sandbox sans Internet + token requis).
 * - whatsapp: code RÉEL (signature + parse) — BLOCKED (accès Meta requis).
 */

export interface VerifySignatureInput {
  headers: Record<string, unknown>;
  rawBody: string;
  secret: string;
}

export interface ParseWebhookInput {
  headers: Record<string, unknown>;
  body: unknown;
}

export interface SendInput {
  externalId: string;
  text: string;
}

/** Contrat commun à tous les canaux. */
export interface ChannelAdapter {
  readonly channel: Channel;
  /** Vérifie la signature du webhook (temps constant). Lance si absente. */
  verifySignature(input: VerifySignatureInput): boolean;
  /** Normalise le payload du webhook en messages entrants. */
  parseWebhook(input: ParseWebhookInput): InboundMessage[];
  /** Envoie un texte. BLOCKED si les credentials du canal sont absents. */
  send(input: SendInput): Promise<{ externalId: string }>;
  /**
   * Message modèle (hors fenêtre 24 h WhatsApp). Telegram/mock : simple envoi.
   * Les modèles WhatsApp doivent être approuvés côté Meta au préalable.
   */
  sendTemplate(input: SendInput & { template: string; params?: string[] }): Promise<{ externalId: string }>;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = createHmac('sha256', 'cmp').update(a).digest();
  const right = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(left, right);
}

/* --------------------------------- Mock ---------------------------------- */

/** Adaptateur de test : signature = texte brut attendu, payload trivial. */
export class MockAdapter implements ChannelAdapter {
  readonly channel = 'mock' as const;
  public readonly sent: { externalId: string; text: string; template?: string }[] = [];

  verifySignature({ headers, rawBody, secret }: VerifySignatureInput): boolean {
    const provided = String(headers['x-mock-signature'] ?? '');
    return constantTimeEqual(provided, createHmac('sha256', secret).update(rawBody).digest('hex'));
  }

  parseWebhook({ body }: ParseWebhookInput): InboundMessage[] {
    const payload = body as { messageId?: unknown; senderId?: unknown; kind?: unknown; text?: unknown; forwarded?: unknown; mediaBytes?: unknown };
    if (typeof payload.messageId !== 'string' || typeof payload.senderId !== 'string') {
      throw new Error('mock: payload malformé');
    }
    const kind = (['text', 'photo', 'pdf', 'voice', 'forwarded', 'command', 'other'] as MessageKind[]).includes(payload.kind as MessageKind)
      ? (payload.kind as MessageKind)
      : 'other';
    return [
      {
        channel: 'mock',
        externalMessageId: payload.messageId,
        externalSenderId: payload.senderId,
        kind,
        forwarded: payload.forwarded === true || kind === 'forwarded',
        text: typeof payload.text === 'string' ? payload.text : undefined,
        mediaBytes: typeof payload.mediaBytes === 'number' ? payload.mediaBytes : undefined,
      },
    ];
  }

  async send({ externalId, text }: SendInput): Promise<{ externalId: string }> {
    this.sent.push({ externalId, text });
    return { externalId: `mock_${this.sent.length}` };
  }

  async sendTemplate({ externalId, text, template }: SendInput & { template: string }): Promise<{ externalId: string }> {
    this.sent.push({ externalId, text, template });
    return { externalId: `mock_tpl_${this.sent.length}` };
  }
}

/* ------------------------------- Telegram -------------------------------- */

/**
 * Telegram Bot API officielle (https://api.telegram.org).
 * Signature : en-tête secret partagé `x-telegram-bot-api-secret-token`
 * (comparaison en temps constant). Exécution réseau : BLOCKED hors production
 * (aucun token ni Internet dans ce sandbox) — le code est testé au mock.
 */
export class TelegramAdapter implements ChannelAdapter {
  readonly channel = 'telegram' as const;

  constructor(
    private readonly botToken: string | undefined,
    private readonly webhookSecret: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  verifySignature({ headers, secret }: VerifySignatureInput): boolean {
    const provided = String(headers['x-telegram-bot-api-secret-token'] ?? '');
    const expected = secret || this.webhookSecret || '';
    if (expected.length === 0 || provided.length === 0) return false;
    return constantTimeEqual(provided, expected);
  }

  parseWebhook({ body }: ParseWebhookInput): InboundMessage[] {
    const payload = body as {
      update_id?: unknown;
      message?: {
        message_id?: unknown;
        from?: { id?: unknown; username?: unknown };
        text?: unknown;
        caption?: unknown;
        photo?: unknown[];
        document?: { mime_type?: unknown };
        voice?: unknown;
        forward_origin?: unknown;
      };
    };
    const message = payload.message;
    if (!message || typeof message.message_id !== 'number' || typeof message.from?.id !== 'number') {
      throw new Error('telegram: update sans message exploitable');
    }
    const kind: MessageKind = message.voice
      ? 'voice'
      : message.document?.mime_type === 'application/pdf'
        ? 'pdf'
        : message.photo
          ? 'photo'
          : typeof message.text === 'string' && message.text.startsWith('/')
            ? 'command'
            : 'text';
    const text = typeof message.text === 'string' ? message.text : typeof message.caption === 'string' ? message.caption : undefined;
    return [
      {
        channel: 'telegram',
        externalMessageId: String(message.message_id),
        externalSenderId: String(message.from.id),
        kind: message.forward_origin ? 'forwarded' : kind,
        forwarded: message.forward_origin !== undefined,
        text,
        mediaBytes: undefined,
      },
    ];
  }

  private async call(method: string, payload: Record<string, unknown>): Promise<{ externalId: string }> {
    if (!this.botToken) {
      throw new Error('BLOCKED: TELEGRAM_BOT_TOKEN non configuré (aucun appel réseau effectué).');
    }
    const response = await this.fetchImpl(`https://api.telegram.org/bot${this.botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`telegram: ${method} a échoué (${response.status})`);
    }
    const json = (await response.json()) as { result?: { message_id?: number } };
    return { externalId: String(json.result?.message_id ?? '0') };
  }

  async send({ externalId, text }: SendInput): Promise<{ externalId: string }> {
    return this.call('sendMessage', { chat_id: externalId, text });
  }

  async sendTemplate({ externalId, text }: SendInput & { template: string }): Promise<{ externalId: string }> {
    // Telegram n'a pas de modèles : envoyé comme message normal.
    return this.call('sendMessage', { chat_id: externalId, text });
  }
}

/* -------------------------------- WhatsApp -------------------------------- */

/**
 * WhatsApp Cloud API officielle (graph.facebook.com).
 * Signature : `x-hub-signature-256` = HMAC-SHA256 du corps brut avec le
 * App Secret. Exécution réseau : BLOCKED (accès Meta requis) — signature et
 * parsing sont testés au mock de fetch.
 */
export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = 'whatsapp' as const;

  constructor(
    private readonly accessToken: string | undefined,
    private readonly appSecret: string | undefined,
    private readonly phoneNumberId: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  verifySignature({ headers, rawBody, secret }: VerifySignatureInput): boolean {
    const provided = String(headers['x-hub-signature-256'] ?? '');
    const key = secret || this.appSecret || '';
    if (key.length === 0 || !provided.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', key).update(rawBody).digest('hex');
    return constantTimeEqual(provided.slice(7), expected);
  }

  parseWebhook({ body }: ParseWebhookInput): InboundMessage[] {
    const payload = body as {
      entry?: {
        changes?: {
          value?: {
            messages?: {
              id?: unknown;
              from?: unknown;
              type?: unknown;
              text?: { body?: unknown };
              image?: unknown;
              document?: { mime_type?: unknown };
              audio?: unknown;
              context?: { forwarded?: unknown; frequently_forwarded?: unknown };
            }[];
          };
        }[];
      }[];
    };
    const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
    const normalized: InboundMessage[] = [];
    for (const message of messages) {
      if (typeof message.id !== 'string' || typeof message.from !== 'string') {
        throw new Error('whatsapp: message sans identifiant');
      }
      const kind: MessageKind = message.audio
        ? 'voice'
        : message.document
          ? 'pdf'
          : message.image
            ? 'photo'
            : typeof message.text?.body === 'string' && message.text.body.startsWith('/')
              ? 'command'
              : 'text';
      normalized.push({
        channel: 'whatsapp',
        externalMessageId: message.id,
        externalSenderId: message.from,
        kind: message.context?.forwarded || message.context?.frequently_forwarded ? 'forwarded' : kind,
        forwarded: message.context?.forwarded === true || message.context?.frequently_forwarded === true,
        text: typeof message.text?.body === 'string' ? message.text.body : undefined,
      });
    }
    return normalized;
  }

  private async call(phoneNumberId: string, payload: Record<string, unknown>): Promise<{ externalId: string }> {
    if (!this.accessToken || !this.phoneNumberId) {
      throw new Error('BLOCKED: WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID non configurés (aucun appel réseau effectué).');
    }
    const response = await this.fetchImpl(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`whatsapp: envoi a échoué (${response.status})`);
    }
    const json = (await response.json()) as { messages?: { id?: string }[] };
    return { externalId: json.messages?.[0]?.id ?? '0' };
  }

  async send({ externalId, text }: SendInput): Promise<{ externalId: string }> {
    return this.call(this.phoneNumberId ?? '', {
      messaging_product: 'whatsapp',
      to: externalId,
      type: 'text',
      text: { body: text },
    });
  }

  async sendTemplate({ externalId, template, params = [] }: SendInput & { template: string; params?: string[] }): Promise<{ externalId: string }> {
    // Rappels hors fenêtre 24 h : modèle APPROUVÉ requis côté Meta.
    return this.call(this.phoneNumberId ?? '', {
      messaging_product: 'whatsapp',
      to: externalId,
      type: 'template',
      template: {
        name: template,
        language: { code: 'fr' },
        components: params.length > 0 ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }] : undefined,
      },
    });
  }
}

export { constantTimeEqual };
