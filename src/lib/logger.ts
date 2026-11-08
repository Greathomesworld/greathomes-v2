import { sanitizeAuditPayload } from '../domain/audit/auditSanitizer.ts';
import { isProduction } from './config.ts';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogContext {
  requestId?: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  staffId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  errorCode?: string;
  [key: string]: any;
}

export class Logger {
  private formatLog(level: LogLevel, message: string, context?: LogContext): string {
    const sanitizedContext = context ? sanitizeAuditPayload(context) : {};
    
    // Strip out sensitive system vars from logged objects
    if (sanitizedContext) {
      delete sanitizedContext.DATABASE_URL;
      delete sanitizedContext.databaseUrl;
      delete sanitizedContext.GEMINI_API_KEY;
      delete sanitizedContext.geminiApiKey;
    }

    const logObject = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(sanitizedContext || {}),
    };

    return JSON.stringify(logObject);
  }

  debug(message: string, context?: LogContext): void {
    if (!isProduction()) {
      console.debug(this.formatLog('DEBUG', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    console.info(this.formatLog('INFO', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatLog('WARN', message, context));
  }

  error(message: string, context?: LogContext): void {
    console.error(this.formatLog('ERROR', message, context));
  }
}

export const logger = new Logger();
