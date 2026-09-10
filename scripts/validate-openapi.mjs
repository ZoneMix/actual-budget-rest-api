import SwaggerParser from '@apidevtools/swagger-parser';
import { readFile } from 'fs/promises';
import path from 'path';

const specPath = path.resolve(process.cwd(), 'src/docs/openapi.yml');
const packagePath = path.resolve(process.cwd(), 'package.json');

(async () => {
  try {
    // The spec on disk only carries a 0.0.0 placeholder — the real version comes from package.json, the
    // one place the version is maintained (src/config/swagger.js does the same
    // when it serves /docs). Dereferencing first resolves every relative $ref
    // against the spec's own directory, so the object handed to validate() no
    // longer needs a base path.
    const { version } = JSON.parse(await readFile(packagePath, 'utf8'));
    const spec = await SwaggerParser.dereference(specPath);
    const api = await SwaggerParser.validate({ ...spec, info: { ...spec.info, version } });

    console.log('OpenAPI validation succeeded. Title:', api.info?.title, 'Version:', api.info?.version);
  } catch (err) {
    console.error('OpenAPI validation failed:', err.message);
    if (err.details) {
      err.details.forEach((d) => console.error('-', d));
    }
    process.exit(1);
  }
})();
