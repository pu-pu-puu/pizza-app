import * as Sentry from '@sentry/nextjs';
import { getRequestId } from './request-context';

const SERVICE = 'pizza-app';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, err?: unknown, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

type PinoLike = {
  debug(obj: LogFields, msg: string): void;
  info(obj: LogFields, msg: string): void;
  warn(obj: LogFields, msg: string): void;
  error(obj: LogFields, msg: string): void;
};

const isBrowser = typeof window !== 'undefined';
const isNodeServer =
  !isBrowser &&
  typeof process !== 'undefined' &&
  process.env.NEXT_RUNTIME === 'nodejs';

const pinoLogger = createPinoLogger();

function createPinoLogger(): PinoLike | null {
  if (!isNodeServer) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-eval
    const requireFn = eval('require') as NodeJS.Require;
    const pino = requireFn('pino') as typeof import('pino');
    return pino.default({
      level: process.env.LOG_LEVEL ?? 'info',
      base: { service: SERVICE },
      formatters: {
        level: (label) => ({ level: label }),
      },
      mixin: () => {
        const requestId = getRequestId();
        return requestId ? { requestId } : {};
      },
    });
  } catch {
    return null;
  }
}

function normalizeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    };
  }
  if (err === undefined) return {};
  return { err: { value: err } };
}

function emitBreadcrumb(level: LogLevel, message: string, fields: LogFields) {
  if (level === 'debug') return;
  Sentry.addBreadcrumb({
    category: 'log',
    level: level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'info',
    message,
    data: Object.keys(fields).length > 0 ? fields : undefined,
  });
}

function emit(level: LogLevel, message: string, fields: LogFields) {
  if (pinoLogger) {
    pinoLogger[level]({ ...fields }, message);
  } else {
    const requestId = getRequestId();
    const payload = {
      level,
      time: new Date().toISOString(),
      service: SERVICE,
      ...(requestId ? { requestId } : {}),
      message,
      ...fields,
    };
    const text = JSON.stringify(payload);
    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(text);
    } else if (level === 'warn') {
      // eslint-disable-next-line no-console
      console.warn(text);
    } else if (level === 'debug') {
      // eslint-disable-next-line no-console
      console.debug(text);
    } else {
      // eslint-disable-next-line no-console
      console.log(text);
    }
  }
  emitBreadcrumb(level, message, fields);
}

function makeLogger(baseFields: LogFields): Logger {
  return {
    debug(message, fields) {
      emit('debug', message, { ...baseFields, ...(fields ?? {}) });
    },
    info(message, fields) {
      emit('info', message, { ...baseFields, ...(fields ?? {}) });
    },
    warn(message, fields) {
      emit('warn', message, { ...baseFields, ...(fields ?? {}) });
    },
    error(message, err, fields) {
      emit('error', message, {
        ...baseFields,
        ...normalizeError(err),
        ...(fields ?? {}),
      });
    },
    child(bindings) {
      return makeLogger({ ...baseFields, ...bindings });
    },
  };
}

export const logger: Logger = makeLogger({});
