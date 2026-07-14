import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const tools = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/tools' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    /** Stable sort order (order of addition). */
    no: z.number().int().positive(),
    category: z.enum(['text', 'data', 'converters', 'images', 'dynamics-365', 'design']),
    description: z.string().max(155),
    keywords: z.array(z.string()),
    version: z.string(),
    added: z.coerce.date(),
    relatedTools: z.array(z.string()),
    faq: z.array(
      z.object({
        q: z.string(),
        a: z.string(),
      }),
    ),
  }),
});

export const collections = { tools };
