import { fileURLToPath } from 'url';
import path from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';
import swaggerUi from 'swagger-ui-express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const specPath = path.join(__dirname, '../docs/openapi.yml');
const baseSpecs = await SwaggerParser.dereference(specPath);

/**
 * Creates a dynamic Swagger spec with server URL based on the request.
 * This allows the API docs to work correctly behind reverse proxies like Traefik.
 */
function getDynamicSpecs(req) {
	// Clone the base specs to avoid mutating the original
	const specs = JSON.parse(JSON.stringify(baseSpecs));
	
	// Get protocol and host from request
	// When behind a proxy, these should come from X-Forwarded-Proto and Host headers
	// req.protocol is set by Express when trust proxy is enabled
	const protocol = req.protocol || (req.get('x-forwarded-proto')?.split(',')[0]?.trim()) || 'http';
	const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
	const baseUrl = `${protocol}://${host}`;
	
	// Update server URL dynamically
	if (specs?.servers?.[0]) {
		specs.servers[0].url = baseUrl;
		specs.servers[0].description = 'Current server';
	}
	
	return specs;
}

/**
 * Middleware that sets up Swagger UI with dynamic specs per request.
 * This ensures the server URL in the API docs matches the current request URL,
 * which is essential when running behind reverse proxies like Traefik.
 */
const setupDynamicSwaggerUi = (req, res, next) => {
	const dynamicSpecs = getDynamicSpecs(req);
	return swaggerUi.setup(dynamicSpecs)(req, res, next);
};

export { swaggerUi, getDynamicSpecs, setupDynamicSwaggerUi };