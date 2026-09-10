/**
 * Structured logging with Winston.
 * Supports multiple log levels and structured JSON output.
 */

import winston from 'winston';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

// Custom format for development (readable)
const devFormat = printf(({ level, message, timestamp: ts, ...metadata }) => {
  let msg = `${ts} [${level}] ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Determine log level from environment
const logLevel = process.env.LOG_LEVEL || 'info';
const isProd = process.env.NODE_ENV === 'production';

// Create the logger
const logger = winston.createLogger({
  level: logLevel,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })
  ),
  defaultMeta: {
    service: 'budget-api',
    env: process.env.NODE_ENV || 'development',
  },
  transports: [
    new winston.transports.Console({
      format: isProd
        ? combine(json())
        : combine(colorize(), devFormat),
    }),
  ],
});

// Security audit logger.
//
// Both helpers MUST pass a message string as the first argument: Winston treats
// a lone object as the `info` payload and renders `message` as `[object
// Object]`, which made the entire auth audit trail unreadable. The metadata
// shape is unchanged — only a greppable message is added in front of it.
export const logAuthEvent = (event, userId, details, success) => {
  logger.info(`auth:${event}`, {
    type: 'AUTH_EVENT',
    event,
    userId,
    success,
    ...details,
  });
};

export const logSuspiciousActivity = (type, userId, details) => {
  logger.error(`security:${type}`, {
    type: 'SECURITY_ALERT',
    category: type,
    userId,
    ...details,
    alert: true,
  });
};

export default logger;
