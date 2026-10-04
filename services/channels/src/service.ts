import { createHash, randomInt } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  type Channel,
  type ChannelIdentity,
  type ConsentStatus,
  type InboundMessage,
  channelIdentitySchema,
} from '@nexus/contracts';
import {
  accessLogs,
  channelIdentities,
  channelLinkCodes,
  channelMessages,
  deletionRequests,
  type Database,
} from '@nexus/db';
import { t, type Locale } from './i18n.js';
import type { ChannelAdapter, SendInput } from './adapter.js';

/**
 * Service canaux — logique métier du copilote côté messagerie.
 * Isolation par tenant systématique ; contenu des messages JAMAIS persisté
 * (minimisation : seules les métadonnées sont journalisées).
 */
export interface ChannelServiceDeps {
  db: Database;
  /** Sel utilisé pour hacher les IP du journal d'accès (jamais en clair). */
  ipHashSalt: string;
}

function toIdentity(row: typeof channelIdentities.$inferSelect): ChannelIdentity {
  return channelIdentitySchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    channel: row.channel,
    externalId: row.externalId,
    externalTag: row.externalTag,
    consent: row.consent,
    linkedAt: row.linkedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
}

export function createChannelService(deps: ChannelServiceDeps) {
  const { db } = deps;

  function hashIp(ip: string): string {
    return createHash('sha256').update(`${deps.ipHashSalt}:${ip}`).digest('hex').slice(0, 32);
  }

  return {
    /** Crée un code de liaison à usage unique (10 min) pour l'utilisateur courant. */
    async createLinkCode(tenantId: string, userId: string, channel: Channel): Promise<{ id: string; channel: Channel; code: string; expiresAt: string }> {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const [row] = await db
        .insert(channelLinkCodes)
        .values({ tenantId, userId, channel, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) })
        .returning();
      return { id: row!.id, channel: row!.channel, code: row!.code, expiresAt: row!.expiresAt.toISOString() };
    },

    /** Consomme un code de liaison et rattache l'identité externe (usage unique). */
    async consumeLinkCode(input: { channel: Channel; code: string; externalId: string; externalTag?: string }): Promise<ChannelIdentity> {
      const [codeRow] = await db
        .select()
        .from(channelLinkCodes)
        .where(and(eq(channelLinkCodes.channel, input.channel), eq(channelLinkCodes.code, input.code)))
        .limit(1);
      if (!codeRow || codeRow.usedAt || codeRow.expiresAt.getTime() < Date.now()) {
        throw new Error('CODE_INVALID');
      }
      const [existing] = await db
        .select()
        .from(channelIdentities)
        .where(and(eq(channelIdentities.channel, input.channel), eq(channelIdentities.externalId, input.externalId)))
        .limit(1);
      await db.update(channelLinkCodes).set({ usedAt: new Date() }).where(eq(channelLinkCodes.id, codeRow.id));
      if (existing) {
        const [updated] = await db
          .update(channelIdentities)
          .set({
            userId: codeRow.userId,
            tenantId: codeRow.tenantId,
            externalTag: input.externalTag ?? existing.externalTag,
            consent: 'granted',
            linkedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(channelIdentities.id, existing.id))
          .returning();
        return toIdentity(updated!);
      }
      const [identity] = await db
        .insert(channelIdentities)
        .values({
          tenantId: codeRow.tenantId,
          userId: codeRow.userId,
          channel: input.channel,
          externalId: input.externalId,
          externalTag: input.externalTag,
          consent: 'granted',
        })
        .returning();
      await db.insert(accessLogs).values({
        tenantId: codeRow.tenantId,
        actor: codeRow.userId,
        action: 'channel.link',
        resource: `${input.channel}:${input.externalId}`,
      });
      return toIdentity(identity!);
    },

    /** Identité liée pour un expéditeur externe (null si inconnue). */
    async findIdentity(channel: Channel, externalId: string): Promise<ChannelIdentity | null> {
      const [row] = await db
        .select()
        .from(channelIdentities)
        .where(and(eq(channelIdentities.channel, channel), eq(channelIdentities.externalId, externalId)))
        .limit(1);
      return row ? toIdentity(row) : null;
    },

    /** Consentement : seul 'granted' autorise les envois. */
    async setConsent(identityId: string, tenantId: string, consent: ConsentStatus): Promise<void> {
      await db
        .update(channelIdentities)
        .set({ consent, updatedAt: new Date() })
        .where(and(eq(channelIdentities.id, identityId), eq(channelIdentities.tenantId, tenantId)));
    },

    /** Identités de l'utilisateur (isolation : tenant + utilisateur). */
    async listIdentities(tenantId: string, userId: string): Promise<ChannelIdentity[]> {
      const rows = await db
        .select()
        .from(channelIdentities)
        .where(and(eq(channelIdentities.tenantId, tenantId), eq(channelIdentities.userId, userId)));
      return rows.map(toIdentity);
    },

    /** Dissocie une identité (tenant + utilisateur uniquement). */
    async unlink(identityId: string, tenantId: string, userId: string): Promise<boolean> {
      const rows = await db
        .delete(channelIdentities)
        .where(and(eq(channelIdentities.id, identityId), eq(channelIdentities.tenantId, tenantId), eq(channelIdentities.userId, userId)))
        .returning({ id: channelIdentities.id });
      return rows.length > 0;
    },

    /**
     * Traite un message entrant : idempotence par identifiant externe,
     * routage des commandes, réponse adaptée. Le contenu n'est pas stocké.
     * Renvoie le texte à répondre (null = message dupliqué, rien à faire).
     */
    async handleInbound(message: InboundMessage, locale: Locale = 'fr', ip = '0.0.0.0'): Promise<{ reply: string | null; duplicate: boolean; identity?: ChannelIdentity }> {
      // 1. Liaison : un expéditeur inconnu qui envoie le code à 6 chiffres
      //    affiché dans l'application web lie son compte (usage unique).
      //    Les expéditeurs non liés ne laissent AUCUNE trace (pas de contenu
      //    ni de métadonnée de personnes non consentantes).
      const identity = await this.findIdentity(message.channel, message.externalSenderId);
      if (!identity) {
        const code = message.text?.trim();
        if (code && /^\d{6}$/.test(code)) {
          try {
            const linkedIdentity = await this.consumeLinkCode({
              channel: message.channel,
              code,
              externalId: message.externalSenderId,
            });
            return { reply: t(locale, 'linked'), duplicate: false, identity: linkedIdentity };
          } catch {
            // Code invalide/expiré/déjà utilisé : message neutre (pas d'indice).
            return { reply: t(locale, 'unknown_link'), duplicate: false };
          }
        }
        return { reply: t(locale, 'unknown_link'), duplicate: false };
      }

      // 2. Idempotence : le même message externe n'est jamais traité deux fois
      //    (contrainte UNIQUE direction+external_message_id, conflit ignoré).
      const inserted = await db
        .insert(channelMessages)
        .values({
          tenantId: identity.tenantId,
          identityId: identity.id,
          direction: 'in',
          kind: message.kind,
          externalMessageId: `${message.channel}:${message.externalSenderId}:${message.externalMessageId}`,
          forwarded: message.forwarded,
          // Minimisation : seule la TAILLE du média est journalisée, jamais son contenu.
          mediaBytes: message.mediaBytes ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) {
        return { reply: null, duplicate: true };
      }
      await db.insert(accessLogs).values({
        tenantId: identity.tenantId,
        actor: identity.userId,
        action: 'channel.message.in',
        resource: `${message.channel}:${message.kind}${message.forwarded ? ':forwarded' : ''}`,
        ipHash: hashIp(ip),
      });

      // 3. Commandes.
      if (message.kind === 'command' && message.text) {
        const command = /^\/([a-z]+)/.exec(message.text.toLowerCase())?.[1];
        if (command === 'aide') {
          return { reply: t(locale, 'help'), duplicate: false };
        }
        if (command === 'stop') {
          await this.setConsent(identity.id, identity.tenantId, 'revoked');
          await db.insert(accessLogs).values({ tenantId: identity.tenantId, actor: identity.userId, action: 'channel.consent.revoke', resource: message.channel });
          return { reply: t(locale, 'optout_done'), duplicate: false };
        }
        if (command === 'supprimer') {
          const [request] = await db
            .insert(deletionRequests)
            .values({ tenantId: identity.tenantId, userId: identity.userId, scope: 'all' })
            .returning();
          await db.insert(accessLogs).values({ tenantId: identity.tenantId, actor: identity.userId, action: 'gdpr.deletion_requested', resource: request!.id });
          return { reply: t(locale, 'delete_done'), duplicate: false };
        }
        if (command === 'export') {
          const [counts] = await db
            .select({ messages: sql<number>`count(*)::int` })
            .from(channelMessages)
            .where(and(eq(channelMessages.tenantId, identity.tenantId), eq(channelMessages.identityId, identity.id)));
          const identities = await this.listIdentities(identity.tenantId, identity.userId);
          return { reply: t(locale, 'export_done', { identities: identities.length, messages: counts?.messages ?? 0 }), duplicate: false };
        }
      }

      // 4. Message ordinaire (photo/PDF/voix/texte/transféré) : accusé de
      //    réception honnête — le coffre-fort (OCR/extraction) arrive à l'étape 2.
      if (identity.consent === 'revoked') {
        return { reply: t(locale, 'optout_done'), duplicate: false };
      }
      return { reply: t(locale, 'receipt', { kind: message.kind }), duplicate: false };
    },

    /** Fenêtre WhatsApp 24 h : vrai si un message entrant existe dans les 24 h. */
    async withinWhatsAppWindow(identityId: string): Promise<boolean> {
      const [last] = await db
        .select({ createdAt: channelMessages.createdAt })
        .from(channelMessages)
        .where(and(eq(channelMessages.identityId, identityId), eq(channelMessages.direction, 'in')))
        .orderBy(desc(channelMessages.createdAt))
        .limit(1);
      if (!last) return false;
      return Date.now() - last.createdAt.getTime() < 24 * 60 * 60 * 1000;
    },

    /**
     * Envoi sortant : refuse toute identité sans consentement explicite.
     * Règle WhatsApp (Cloud API) : un message libre n'est autorisé que dans
     * les 24 h suivant le dernier message de l'utilisateur ; hors fenêtre,
     * utiliser sendTemplate avec un modèle APPROUVÉ côté Meta.
     */
    async sendTo(adapter: ChannelAdapter, identity: ChannelIdentity, input: SendInput): Promise<{ externalId: string }> {
      if (identity.consent !== 'granted') {
        throw new Error('CONSENT_REQUIRED');
      }
      if (adapter.channel === 'whatsapp' && !(await this.withinWhatsAppWindow(identity.id))) {
        throw new Error('WHATSAPP_WINDOW_EXPIRED: utiliser sendTemplate (modèle approuvé).');
      }
      const result = await adapter.send(input);
      await db.insert(channelMessages).values({
        tenantId: identity.tenantId,
        identityId: identity.id,
        direction: 'out',
        kind: 'text',
        externalMessageId: `${adapter.channel}:${input.externalId}:${result.externalId}`,
        forwarded: false,
        replyKind: 'send',
      });
      return result;
    },
  };
}

export type ChannelService = ReturnType<typeof createChannelService>;
