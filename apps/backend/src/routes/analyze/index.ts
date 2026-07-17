/**
 * Backward-compatible entry point for the analyze route.
 * server.ts imports `from './routes/analyze'` — this re-export means
 * that import path continues to work without any change to server.ts.
 */
export { default } from './controller';
