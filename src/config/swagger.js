import { fileURLToPath } from 'url';
import path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';
import swaggerUi from 'swagger-ui-express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const specPath = path.join(__dirname, '../docs/openapi.yml');
const specs = await SwaggerParser.dereference(specPath);

// Align documented server URL with the running port
const port = process.env.PORT || 3000;
if (specs?.servers?.[0]) {
	specs.servers[0].url = `http://localhost:${port}`;
}

export { swaggerUi, specs };