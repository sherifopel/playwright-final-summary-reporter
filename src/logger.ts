// Lightweight logger using raw ANSI codes — no external dependencies.
// Set LOG_LEVEL=silent to suppress ok/info output (warn and fail always print).

const silent = process.env.LOG_LEVEL === 'silent';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  grey: '\x1b[90m',
  yellow: '\x1b[33m',
  red: '\x1b[91m',
  green: '\x1b[32m',
  cyan: '\x1b[96m',
  white: '\x1b[97m',
} as const;

export const Log = {
  raw(msg: string) {
    process.stdout.write(msg + '\n');
  },

  info(msg: string) {
    if (silent) return;
    console.log(`${C.grey}ℹ️  ${msg}${C.reset}`);
  },

  ok(msg: string) {
    if (silent) return;
    console.log(`${C.grey}✅ ${msg}${C.reset}`);
  },

  warn(msg: string) {
    console.log(`${C.yellow}⚠️  ${msg}${C.reset}`);
  },

  fail(msg: string) {
    console.log(`${C.red}❌ ${msg}${C.reset}`);
  },
};
