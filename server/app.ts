import express, { type ErrorRequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { recipients, queueOptions, ruleSchema } from './domain.ts';
import { Replay } from './replay.ts';
import { Store } from './store.ts';

export function createApp(store: Store, replay: Replay) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/state', (_req, res) => {
    res.json({
      rules: store.listRules(),
      incidents: store.listIncidents(),
      notifications: store.listNotifications(),
      receipts: store.listReceipts(),
      stats: store.stats(),
      observations: store.observations(),
      replay: replay.status(),
      recipients,
      queues: queueOptions,
    });
  });
  app.get('/api/notifications', (_req, res) => res.json(store.listNotifications()));
  app.post('/api/rules', (req, res) => res.status(201).json(store.createRule(req.body)));
  app.put('/api/rules/:id', (req, res) => {
    const rule = store.updateRule(req.params.id, req.body);
    if (!rule) return res.status(404).json({ error: 'Rule not found.' });
    res.json(rule);
  });
  app.delete('/api/rules/:id', (req, res) => {
    if (!store.deleteRule(req.params.id)) return res.status(404).json({ error: 'Rule not found.' });
    res.status(204).end();
  });
  app.post('/api/preview', (req, res) => {
    const rule = ruleSchema.parse(req.body);
    const preview = new Store();
    try {
      preview.createRule({ ...rule, enabled: true });
      for (const e of replay.events) preview.ingest(e);
      // Deliberately never flush preview deliveries into the main inbox.
      res.json({
        notifications: preview.listNotifications(),
        incidents: preview.listIncidents(),
        stats: preview.stats(),
      });
    } finally {
      preview.close();
    }
  });
  app.post('/api/events', (req, res) => {
    const outcome = store.ingest(req.body);
    store.flushOutbox();
    res
      .status(outcome === 'invalid' ? 422 : outcome === 'conflict' ? 409 : 200)
      .json({ outcome, receipt: store.listReceipts()[0] });
  });
  const controlSchema = z
    .object({
      action: z.enum(['play', 'pause', 'step', 'finish', 'reset', 'speed']),
      rate: z.union([z.literal(2), z.literal(4), z.literal(12)]).optional(),
    })
    .strict();
  app.post('/api/replay', (req, res) => {
    const { action, rate } = controlSchema.parse(req.body);
    if (action === 'play') replay.play(rate);
    else if (action === 'pause') replay.pause();
    else if (action === 'speed') replay.setRate(rate ?? 4);
    else if (action === 'step') {
      replay.pause();
      replay.step();
    } else if (action === 'finish') replay.finish();
    else replay.reset();
    res.json(replay.status());
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(422).json({ error: 'Check the highlighted fields.', issues: error.issues });
      return;
    }
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body must be valid JSON.' });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request exceeds 64 KB.' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'The operation could not be completed. Please retry.' });
  };
  app.use(errorHandler);
  return app;
}
