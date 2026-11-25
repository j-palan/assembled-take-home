import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import express from 'express';
import { createApp } from './app.ts';
import { Store } from './store.ts';
import { Replay } from './replay.ts';

const dbPath = process.env.DB_PATH ?? resolve('data/intraday.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const store = new Store(dbPath, true);
const replay = new Replay(store);
const app = createApp(store, replay);
let closeVite: (() => Promise<void>) | undefined;
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
  closeVite = () => vite.close();
}
const worker = setInterval(() => {
  try {
    store.flushOutbox();
  } catch (error) {
    console.error('Outbox worker failed', error);
  }
}, 2000);
store.flushOutbox();
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`Intraday → http://localhost:${port}`),
);
async function shutdown() {
  replay.pause();
  clearInterval(worker);
  server.close();
  server.closeAllConnections();
  await closeVite?.();
  store.close();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
