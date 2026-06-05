import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Cache persistente en disco. Un archivo JSON por entrada.
// Antes de consultar una fuente se mira la cache; si existe se reutiliza,
// si no, se consulta y se guarda el resultado.

/** Slug seguro para nombre de archivo (estable y legible). */
function safeKey(key: string): string {
  const slug = key
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  // Hash corto para evitar colisiones entre nombres parecidos.
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 8);
  return `${slug || 'entry'}.${hash}`;
}

export class JsonCache<T> {
  constructor(private readonly dir: string) {}

  private file(key: string): string {
    return path.join(this.dir, `${safeKey(key)}.json`);
  }

  async has(key: string): Promise<boolean> {
    try {
      await fs.access(this.file(key));
      return true;
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<T | undefined> {
    try {
      const raw = await fs.readFile(this.file(key), 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: T): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(
      this.file(key),
      JSON.stringify(value, null, 2),
      'utf8',
    );
  }

  /** Lee de cache o ejecuta el productor y guarda el resultado. */
  async getOrSet(key: string, producer: () => Promise<T>): Promise<T> {
    const cached = await this.get(key);
    if (cached !== undefined) return cached;
    const value = await producer();
    await this.set(key, value);
    return value;
  }
}
