type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const envLevel = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
const minLevelIndex = LEVELS.indexOf(envLevel) >= 0 ? LEVELS.indexOf(envLevel) : LEVELS.indexOf("info");

const fmtTime = () => new Date().toISOString();

export function logger(scope: string) {
  const logAt = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (LEVELS.indexOf(level) < minLevelIndex) return;
    const base = `[${fmtTime()}] [${level.toUpperCase()}] [${scope}] ${message}`;
    if (meta && Object.keys(meta).length) {
      console.log(base, meta);
    } else {
      console.log(base);
    }
  };

  return {
    debug: (msg: string, meta?: Record<string, unknown>) => logAt("debug", msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => logAt("info", msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => logAt("warn", msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => logAt("error", msg, meta),
  };
}

