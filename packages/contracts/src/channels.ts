import { z } from 'zod';

/**
 * @nexus/channels — canaux de messagerie (Telegram, WhatsApp Cloud API, mock).
 * Règle absolue : seul le contenu que l'utilisateur envoie/transfère est
 * traité. Le contenu des messages n'est JAMAIS persisté en clair
 * (minimisation) : seuls type, identifiants externes et statut de traitement
 * sont stockés.
 */

export const channelSchema = z.enum(['telegram', 'whatsapp', 'mock']);
export type Channel = z.infer<typeof channelSchema>;

export const consentStatusSchema = z.enum(['pending', 'granted', 'revoked']);
export type ConsentStatus = z.infer<typeof consentStatusSchema>;

export const messageKindSchema = z.enum([
  'text',
  'photo',
  'pdf',
  'voice',
  'forwarded',
  'command',
  'other',
]);
export type MessageKind = z.infer<typeof messageKindSchema>;

/** Message entrant normalisé (sortie d'un adaptateur). */
export interface InboundMessage {
  channel: Channel;
  /** Identifiant externe du message — base de l'idempotence. */
  externalMessageId: string;
  /** Identifiant externe de l'expéditeur (chat id / wa id). */
  externalSenderId: string;
  kind: MessageKind;
  /** Transféré par l'utilisateur ? */
  forwarded: boolean;
  /** Texte brut (commandes) — jamais persisté. */
  text?: string;
  /** Taille du média en octets si pièce jointe. */
  mediaBytes?: number;
}

/** Réponse du bot à un message traité. */
export interface OutboundReply {
  text: string;
}

export const channelIdentitySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  channel: channelSchema,
  externalId: z.string(),
  externalTag: z.string().nullable(),
  consent: consentStatusSchema,
  linkedAt: z.string(),
  createdAt: z.string(),
});
export type ChannelIdentity = z.infer<typeof channelIdentitySchema>;

export const createLinkCodeSchema = z.object({
  channel: z.enum(['telegram', 'whatsapp', 'mock']),
});
export type CreateLinkCodeInput = z.infer<typeof createLinkCodeSchema>;

export interface LinkCode {
  id: string;
  channel: Channel;
  code: string;
  expiresAt: string;
  usedAt: string | null;
}

/** Commande supportée par le bot (préfixe `/`). */
export const BOT_COMMANDS = ['aide', 'supprimer', 'export', 'stop'] as const;
export type BotCommand = (typeof BOT_COMMANDS)[number];

export function parseCommand(text: string): { command: BotCommand; args: string } | null {
  const match = /^\/([a-z]+)\s*(.*)$/.exec(text.trim().toLowerCase());
  if (!match || !BOT_COMMANDS.includes(match[1] as BotCommand)) return null;
  return { command: match[1] as BotCommand, args: (match[2] ?? '').trim() };
}
