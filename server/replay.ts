import { readFileSync } from 'node:fs';
import { Store } from './store.ts';

export function readFeed(path = new URL('../events.jsonl', import.meta.url)): unknown[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return line;
      }
    });
}

/** Arrival order is intentional; the final records exercise conflict and late-event handling. */
export class Replay {
  private timer: ReturnType<typeof setInterval> | undefined;
  private rate = 4;
  private error: string | null = null;
  constructor(
    readonly store: Store,
    readonly events: unknown[] = readFeed(),
  ) {}
  get cursor() {
    return Number(this.store.getMeta('replayCursor') ?? 0);
  }
  status() {
    const times = this.events
      .slice(0, this.cursor)
      .map((e) => (e as { ts?: string })?.ts)
      .filter((t): t is string => typeof t === 'string' && Number.isFinite(Date.parse(t)));
    const time = times.length
      ? new Date(Math.max(...times.map((t) => Date.parse(t)))).toISOString()
      : null;
    return {
      cursor: this.cursor,
      total: this.events.length,
      playing: !!this.timer,
      rate: this.rate,
      time,
      error: this.error,
    };
  }
  step() {
    if (this.cursor >= this.events.length) {
      this.pause();
      return;
    }
    this.store.ingest(this.events[this.cursor], this.cursor + 1);
    this.store.flushOutbox();
    if (this.cursor >= this.events.length) this.pause();
  }
  play(rate = this.rate) {
    this.pause();
    this.rate = rate;
    this.error = null;
    if (this.cursor >= this.events.length) return;
    this.timer = setInterval(() => {
      try {
        this.step();
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Replay failed';
        this.pause();
      }
    }, 1000 / rate);
  }
  setRate(rate: number) {
    if (this.timer) this.play(rate);
    else this.rate = rate;
  }
  pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  finish() {
    this.pause();
    while (this.cursor < this.events.length) this.step();
  }
  reset() {
    this.pause();
    this.store.reset();
    this.error = null;
  }
}
