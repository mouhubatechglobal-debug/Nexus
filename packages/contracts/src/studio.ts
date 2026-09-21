import { z } from 'zod';

/**
 * Document de conception NEXUS Studio — JSON versionnable.
 * Structure ouverte mais validée : pages, sections, composants,
 * tokens (couleurs, typographie, espacements), variantes.
 */
export const designTokenColorSchema = z.object({
  name: z.string().min(1).max(40),
  value: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Couleur hex invalide'),
});

export const designTypographySchema = z.object({
  fontFamily: z.string().max(80).default('Inter'),
  scale: z.array(z.object({ name: z.string().max(40), size: z.string().max(20) })).default([]),
});

export const designSpacingSchema = z.object({
  unit: z.string().max(10).default('4px'),
  steps: z.array(z.number().int().nonnegative()).default([]),
});

export const designSectionSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  componentIds: z.array(z.string().max(60)).default([]),
});

export const designPageSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  sections: z.array(designSectionSchema).default([]),
});

export const designComponentSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(80),
  variants: z.array(z.string().max(40)).default([]),
  props: z.record(z.string(), z.unknown()).default({}),
});

export const designDocumentSchema = z.object({
  pages: z.array(designPageSchema).max(200).default([]),
  components: z.array(designComponentSchema).max(500).default([]),
  tokens: z
    .object({
      colors: z.array(designTokenColorSchema).max(100).default([]),
      typography: designTypographySchema.default({ fontFamily: 'Inter', scale: [] }),
      spacing: designSpacingSchema.default({ unit: '4px', steps: [] }),
    })
    .default({ colors: [], typography: { fontFamily: 'Inter', scale: [] }, spacing: { unit: '4px', steps: [] } }),
});

export type DesignDocument = z.infer<typeof designDocumentSchema>;

/** Version sauvegardée d'un document Studio. */
export const designVersionSchema = z.object({
  version: z.number().int().positive(),
  data: designDocumentSchema,
  createdAt: z.string(),
});
export type DesignVersion = z.infer<typeof designVersionSchema>;

export const saveDesignSchema = z.object({ data: designDocumentSchema });
export type SaveDesignInput = z.infer<typeof saveDesignSchema>;
