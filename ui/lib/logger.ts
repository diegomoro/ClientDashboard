export function logInfo(message: string, context?: Record<string, unknown>) {
  console.info(JSON.stringify({ level: "info", message, ...context }));
}

export function logError(message: string, context?: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "error", message, ...context }));
}
