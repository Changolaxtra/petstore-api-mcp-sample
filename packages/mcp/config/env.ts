import { z } from 'zod';

const envSchema = z.object({
  API_BASE_URL: z.string().url(),
  MCP_API_USERNAME: z.string().min(1),
  MCP_API_PASSWORD: z.string().min(1),
  PORT: z
    .string()
    .default('3001')
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive()),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
