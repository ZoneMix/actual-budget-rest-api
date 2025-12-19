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

// Security audit logger
export const logAuthEvent = (event, userId, details, success) => {
  logger.info({
    type: 'AUTH_EVENT',
    event,
    userId,
    success,
    ...details,
  });
};

export const logSuspiciousActivity = (type, userId, details) => {
  logger.error({
    type: 'SECURITY_ALERT',
    category: type,
    userId,
    ...details,
    alert: true,
  });
};

export default logger;
