import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Actual Budget Rest API',
      version: '1.0.0',
      description: 'REST API for Actual Budget API with OAuth2 integration for n8n',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
          },
        },
        Account: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['checking', 'savings', 'credit', 'investment', 'mortgage', 'other'] },
            onBudget: { type: 'boolean' },
            closed: { type: 'boolean' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            amount: { type: 'integer', description: 'Amount in cents' },
            payee: { type: 'string' },
            notes: { type: 'string' },
            date: { type: 'string', format: 'date' },
            category: { type: 'string' },
            account: { type: 'string' },
            cleared: { type: 'boolean' },
          },
        },
        Category: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            group_id: { type: 'string' },
          },
        },
        Payee: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            transfer_acct: { type: 'string' },
          },
        },
        Budget: {
          type: 'object',
          properties: {
            month: { type: 'string' },
            categories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  budgeted: { type: 'integer' },
                  spent: { type: 'integer' },
                  balance: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['/app/routes/*.js'], // Path to the API routes
};

const specs = swaggerJSDoc(options);

export { swaggerUi, specs };