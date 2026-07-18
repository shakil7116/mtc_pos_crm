import { z } from 'zod';
import { insertSettingsSchema, documents as invoices, settings, documentItems as invoiceItems } from './schema';
// Legacy schema aliases
const insertInvoiceSchema = z.any();
const insertInvoiceItemSchema = z.any();

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  settings: {
    get: {
      method: 'GET' as const,
      path: '/api/settings',
      responses: {
        200: z.custom<typeof settings.$inferSelect>(),
      },
    },
    update: {
      method: 'POST' as const,
      path: '/api/settings',
      input: insertSettingsSchema,
      responses: {
        200: z.custom<typeof settings.$inferSelect>(),
      },
    },
  },
  invoices: {
    list: {
      method: 'GET' as const,
      path: '/api/invoices',
      responses: {
        200: z.array(z.custom<typeof invoices.$inferSelect & { items: typeof invoiceItems.$inferSelect[] }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/invoices/:id',
      responses: {
        200: z.custom<typeof invoices.$inferSelect & { items: typeof invoiceItems.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/invoices',
      input: z.object({
        invoiceNumber: z.string(),
        date: z.string(),
        customerName: z.string().optional(),
        totalAmount: z.string(), // numeric is string in JSON
        totalAmountWords: z.string().optional(),
        items: z.array(z.object({
          description: z.string(),
          quantity: z.number().or(z.string()),
          unit: z.string(),
          unitPrice: z.number().or(z.string()),
          amount: z.number().or(z.string()),
          currency: z.string().optional(),
        })),
      }),
      responses: {
        201: z.custom<typeof invoices.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/invoices/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  voice: {
    parse: {
      method: 'POST' as const,
      path: '/api/voice/parse',
      input: z.object({
        audio: z.string(), // base64
      }),
      responses: {
        200: z.object({
          items: z.array(z.object({
            description: z.string(),
            quantity: z.number(),
            unit: z.string(),
            unitPrice: z.number(),
            currency: z.string(),
          })),
        }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
