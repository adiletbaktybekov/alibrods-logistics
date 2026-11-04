import { NextResponse } from 'next/server';
import { siteConfig } from '@/config/site';

export const dynamic = 'force-static';

export async function GET() {
  const spec = {
    openapi: '3.0.3',
    info: {
      title: `${siteConfig.name} API`,
      description: 'API коммерческой платформы доставки грузов на склады Wildberries и Ozon',
      version: '1.0.0',
    },
    servers: [
      {
        url: '/api/v1',
        description: 'Current environment API gateway',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Pass JWT token obtained via /auth/login or /auth/telegram',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Invalid input' },
                details: { type: 'object' },
              },
            },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          summary: 'Service health status',
          responses: {
            '200': { description: 'Service is operational' },
          },
        },
      },
    },
  };

  return NextResponse.json(spec);
}
