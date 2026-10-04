/**
 * i18n minimal — FR par défaut, EN disponible. Aucune chaîne codée en dur
 * dans les adaptateurs/services. Ewe et autres langues : ajoutées plus tard.
 */
export type Locale = 'fr' | 'en';

const STRINGS = {
  fr: {
    help: 'Je range vos documents (factures, garanties, contrats) et vous rappelle les échéances. Envoyez une photo d\u2019une facture pour commencer. Commandes : /export (vos données), /supprimer (tout effacer), /stop (ne plus recevoir).',
    linked: 'Compte lié avec succès. Envoyez /aide pour découvrir ce que je fais.',
    consent_required: 'Vous devez d\u2019abord accepter les conditions via le code de liaison envoyé depuis l\u2019application.',
    unknown_link: 'Ce compte n\u2019est pas encore lié. Liez-le depuis l\u2019application web avec le code à usage unique.',
    optout_done: 'C\u2019est noté : vous ne recevrez plus de messages. Envoyez /aide pour revenir.',
    delete_done: 'Votre demande de suppression est enregistrée. Toutes vos données seront effacées et vous recevrez une confirmation.',
    export_done: 'Export : aucun document stocké pour le moment. Votre espace contient {identities} liaison(s) de messagerie et {messages} message(s) journalisé(s) (métadonnées uniquement).',
    receipt: 'Reçu : {kind}. Traitement dès que le coffre-fort sera activé.',
  },
  en: {
    help: 'I file your documents (bills, warranties, contracts) and remind you of deadlines. Send a photo of a bill to start. Commands: /export (your data), /supprimer (delete all), /stop (stop receiving).',
    linked: 'Account linked successfully. Send /aide to see what I do.',
    consent_required: 'You must first accept the terms using the one-time code sent from the app.',
    unknown_link: 'This account is not linked yet. Link it from the web app with the one-time code.',
    optout_done: 'Got it: you will not receive any more messages. Send /aide to come back.',
    delete_done: 'Your deletion request is registered. All your data will be erased and you will receive a confirmation.',
    export_done: 'Export: no documents stored yet. Your space has {identities} messaging link(s) and {messages} logged message(s) (metadata only).',
    receipt: 'Received: {kind}. Processing starts when the vault is enabled.',
  },
} as const;

export type MessageKey = keyof (typeof STRINGS)['fr'];

export function t(locale: Locale | undefined, key: MessageKey, params: Record<string, string | number> = {}): string {
  const dictionary = STRINGS[locale ?? 'fr'] ?? STRINGS['fr'];
  let text: string = dictionary[key];
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
