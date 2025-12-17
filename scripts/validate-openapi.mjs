import SwaggerParser from '@apidevtools/swagger-parser';
import path from 'path';

const specPath = path.resolve(process.cwd(), 'src/docs/openapi.yml');

(async () => {
  try {
    const api = await SwaggerParser.validate(specPath);
    console.log('OpenAPI validation succeeded. Title:', api.info?.title, 'Version:', api.info?.version);
  } catch (err) {
    console.error('OpenAPI validation failed:', err.message);
    if (err.details) {
      err.details.forEach((d) => console.error('-', d));
    }
    process.exit(1);
  }
})();
