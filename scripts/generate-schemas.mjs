import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { format, resolveConfig } from 'prettier';
import { configSchema, reportSchema, coverageSchema } from '../dist/index.js';

// Les schémas sont dérivés des validateurs runtime, sans maintenir de copie manuelle.
await mkdir('schemas', { recursive: true });
const formatting = await resolveConfig('schemas/config.schema.json');
for (const [name, schema] of Object.entries({
  config: configSchema,
  report: reportSchema,
  coverage: coverageSchema,
})) {
  await writeFile(
    `schemas/${name}.schema.json`,
    await format(JSON.stringify(z.toJSONSchema(schema, { io: 'input' })), {
      ...formatting,
      parser: 'json',
    }),
  );
}
