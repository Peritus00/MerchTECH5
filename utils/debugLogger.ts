// Global debug logging system
// This file should be imported early in the app lifecycle to capture all logs

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  data?: any;
}

// Global log storage - accessible from anywhere
export const logStorage: LogEntry[] = [];
const MAX_LOGS = 500;

// Store original console methods
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const originalInfo = console.info;

function addLog(level: LogEntry['level'], ...args: any[]) {
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  const logEntry: LogEntry = {
    id: `${Date.now()}-${Math.random()}`,
    timestamp: new Date(),
    level,
    message,
    data: args.length > 1 ? args.slice(1) : undefined,
  };

  logStorage.push(logEntry);
  if (logStorage.length > MAX_LOGS) {
    logStorage.shift();
  }
}

// Override console methods to capture logs
console.log = (...args: any[]) => {
  addLog('log', ...args);
  originalLog(...args);
};

console.warn = (...args: any[]) => {
  addLog('warn', ...args);
  originalWarn(...args);
};

console.error = (...args: any[]) => {
  addLog('error', ...args);
  originalError(...args);
};

console.info = (...args: any[]) => {
  addLog('info', ...args);
  originalInfo(...args);
};

// Export types for use in other files
export type { LogEntry };

