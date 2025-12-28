/**
 * Centralized environment variable validation and configuration.
 *
 * This module validates all environment variables on startup using Zod schemas.
 * Invalid or missing required variables will cause the application to exit with
 * clear error messages.
 *
 * @see https://zod.dev/ for schema validation documentation
 */

import { z } from 'zod';
import logger from '../logging/logger.js';

/**
 * Environment variable schema with validation rules.
 * All environment variables are validated against this schema on import.
 */
const envSchema = z.object({
  // ============================================================================
  // Server Configuration
  // ============================================================================
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().int().positive()).default('3000'),
  TRUST_PROXY: z.string().transform(v => v === 'true').optional(),

  // ============================================================================
  // Authentication & Security
  // ============================================================================
  ADMIN_USER: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(1, 'ADMIN_PASSWORD is required'),
  // SESSION_SECRET: Optional in development, required in production (validated after parsing)
  SESSION_SECRET: z.string().optional(),
  // JWT_SECRET: Can be shorter in development, must be 32+ in production (validated after parsing)
  JWT_SECRET: z.string().optional(),
  // JWT_REFRESH_SECRET: Can be shorter in development, must be 32+ in production (validated after parsing)
  JWT_REFRESH_SECRET: z.string().optional(),
  JWT_ACCESS_TTL: z.string().default('1h'),
  JWT_REFRESH_TTL: z.string().default('24h'),

  // ============================================================================
  // Actual Budget Integration
  // ============================================================================
  ACTUAL_SERVER_URL: z.string().url('ACTUAL_SERVER_URL must be a valid URL'),
  ACTUAL_PASSWORD: z.string().min(1, 'ACTUAL_PASSWORD is required'),
  ACTUAL_SYNC_ID: z.string().min(1, 'ACTUAL_SYNC_ID is required'),
  DATA_DIR: z.string().default('/app/.actual-cache'),

  // ============================================================================
  // CORS Configuration
  // ============================================================================
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5678'),

  // ============================================================================
  // Logging Configuration
  // ============================================================================
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // ============================================================================
  // Redis Configuration (Optional, for rate limiting)
  // ============================================================================
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL').optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
  REDIS_PASSWORD: z.string().optional(),

  // ============================================================================
  // Database Configuration (Authentication DB)
  // ============================================================================
  // Database type: 'postgres' (default) or 'sqlite'
  DB_TYPE: z.enum(['sqlite', 'postgres']).default('postgres'),
  // PostgreSQL connection URL (required if DB_TYPE=postgres)
  // Format: postgresql://user:password@host:port/database
  POSTGRES_URL: z.string().url('POSTGRES_URL must be a valid URL').optional(),
  // Alternative PostgreSQL connection details (if not using POSTGRES_URL)
  POSTGRES_HOST: z.string().optional(),
  POSTGRES_PORT: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
  POSTGRES_DB: z.string().optional(),
  POSTGRES_USER: z.string().optional(),
  POSTGRES_PASSWORD: z.string().optional(),

  // ============================================================================
  // Security Features (Optional flags)
  // ============================================================================
  ENABLE_CORS: z.string().transform(v => v === 'true').default('true'),
  ENABLE_HELMET: z.string().transform(v => v === 'true').default('true'),
  ENABLE_RATE_LIMITING: z.string().transform(v => v === 'true').default('true'),
  MAX_REQUEST_SIZE: z.string().default('10kb'),
});

/**
 * Validates and parses environment variables.
 * Exits the process with error code 1 if validation fails.
 */
let env;
try {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isDevelopment = nodeEnv === 'development';
  const isProduction = nodeEnv === 'production';
  
  env = envSchema.parse(process.env);
  
  // Development: Set defaults for missing secrets (auto-generated weak secrets for dev only)
  if (isDevelopment) {
    if (!env.JWT_SECRET) {
      env.JWT_SECRET = 'dev-jwt-secret-not-for-production-use-' + Math.random().toString(36).substring(7);
      logger.warn('⚠️  JWT_SECRET not set, using auto-generated dev secret (NOT for production!)');
    }
    if (!env.JWT_REFRESH_SECRET) {
      env.JWT_REFRESH_SECRET = 'dev-refresh-secret-not-for-production-use-' + Math.random().toString(36).substring(7);
      logger.warn('⚠️  JWT_REFRESH_SECRET not set, using auto-generated dev secret (NOT for production!)');
    }
    if (!env.SESSION_SECRET) {
      env.SESSION_SECRET = 'dev-session-secret-not-for-production-use-' + Math.random().toString(36).substring(7);
      logger.warn('⚠️  SESSION_SECRET not set, using auto-generated dev secret (NOT for production!)');
    }
    // In development, allow shorter secrets (minimum 8 chars for basic security)
    if (env.JWT_SECRET && env.JWT_SECRET.length < 8) {
      logger.warn('⚠️  JWT_SECRET is very short. Consider using at least 8 characters even in development.');
    }
    if (env.JWT_REFRESH_SECRET && env.JWT_REFRESH_SECRET.length < 8) {
      logger.warn('⚠️  JWT_REFRESH_SECRET is very short. Consider using at least 8 characters even in development.');
    }
    if (env.SESSION_SECRET && env.SESSION_SECRET.length < 8) {
      logger.warn('⚠️  SESSION_SECRET is very short. Consider using at least 8 characters even in development.');
    }
  }
  
  // Production: Strict validation
  if (isProduction) {
    if (!env.SESSION_SECRET) {
      logger.error('❌ SESSION_SECRET is required in production');
      process.exit(1);
    }
    if (!env.JWT_SECRET) {
      logger.error('❌ JWT_SECRET is required in production');
      process.exit(1);
    }
    if (!env.JWT_REFRESH_SECRET) {
      logger.error('❌ JWT_REFRESH_SECRET is required in production');
      process.exit(1);
    }
    
    // Production: Must be at least 32 characters
    if (env.SESSION_SECRET.length < 32) {
      logger.error('❌ SESSION_SECRET must be at least 32 characters in production');
      process.exit(1);
    }
    if (env.JWT_SECRET.length < 32) {
      logger.error('❌ JWT_SECRET must be at least 32 characters in production');
      process.exit(1);
    }
    if (env.JWT_REFRESH_SECRET.length < 32) {
      logger.error('❌ JWT_REFRESH_SECRET must be at least 32 characters in production');
      process.exit(1);
    }
    
    // Production: Secrets must be different
    if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
      logger.error('❌ JWT_SECRET and JWT_REFRESH_SECRET must be different');
      process.exit(1);
    }
    
    if (env.JWT_SECRET === env.SESSION_SECRET) {
      logger.error('❌ JWT_SECRET and SESSION_SECRET must be different');
      process.exit(1);
    }
  }
  
  // Database configuration validation
  if (env.DB_TYPE === 'postgres') {
    const hasPostgresUrl = !!env.POSTGRES_URL;
    const hasPostgresDetails = !!(env.POSTGRES_HOST && env.POSTGRES_DB && env.POSTGRES_USER && env.POSTGRES_PASSWORD);
    
    if (!hasPostgresUrl && !hasPostgresDetails) {
      logger.error('❌ PostgreSQL configuration required when DB_TYPE=postgres');
      logger.error('   Provide either POSTGRES_URL or all of: POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD');
      process.exit(1);
    }
  }
  
  logger.info('✅ Environment variables validated successfully');
} catch (error) {
  // Check if it's a ZodError with errors array
  const isZodError = error instanceof z.ZodError;
  const hasErrors = error?.errors && Array.isArray(error.errors);
  
  if (isZodError && hasErrors) {
    logger.error('❌ Environment variable validation failed:');
    try {
      error.errors.forEach((err) => {
        const path = Array.isArray(err?.path) ? err.path.join('.') : String(err?.path || 'unknown');
        const message = err?.message || 'Validation error';
        logger.error(`  - ${path}: ${message}`);
      });
    } catch (forEachError) {
      logger.error('  - Error processing validation errors:', forEachError);
      logger.error('  - Raw error:', JSON.stringify(error, null, 2));
    }
    logger.error('\nPlease check your .env file and ensure all required variables are set.');
    logger.error('See .env.example for a complete list of required variables.');
  } else {
    // Not a ZodError or doesn't have errors array
    logger.error('❌ Error during environment validation:', {
      errorType: error?.constructor?.name || typeof error,
      message: error?.message || String(error),
      isZodError,
      hasErrors,
      errors: error?.errors,
      stack: error?.stack,
    });
    if (isZodError) {
      logger.error('Note: ZodError detected but errors array is missing or invalid.');
    }
  }
  process.exit(1);
}

/**
 * Validated environment configuration.
 * All values are guaranteed to be valid and typed.
 */
export default env;

/**
 * Helper to check if Redis is configured.
 */
export const isRedisConfigured = () => {
  return !!(env.REDIS_URL || (env.REDIS_HOST && env.REDIS_PORT));
};

/**
 * Helper to check if PostgreSQL is configured.
 */
export const isPostgresConfigured = () => {
  return env.DB_TYPE === 'postgres' && (
    !!env.POSTGRES_URL || 
    !!(env.POSTGRES_HOST && env.POSTGRES_DB && env.POSTGRES_USER && env.POSTGRES_PASSWORD)
  );
};

/**
 * Parse allowed origins from comma-separated string.
 */
export const getAllowedOrigins = () => {
  return env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
};

/**
 * Parse request size limit to bytes.
 */
export const getMaxRequestSize = () => {
  const size = env.MAX_REQUEST_SIZE.toLowerCase();
  const match = size.match(/^(\d+)(kb|mb|gb|b)?$/);
  
  if (!match) {
    logger.warn(`Invalid MAX_REQUEST_SIZE format: ${size}, defaulting to 10kb`);
    return '10kb';
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2] || 'b';
  
  const multipliers = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  
  // Safe: unit is validated against known keys before use
  if (Object.prototype.hasOwnProperty.call(multipliers, unit)) {
    // eslint-disable-next-line security/detect-object-injection
    return value * multipliers[unit];
  }
  return value;
};

