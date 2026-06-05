import fs from 'node:fs/promises';
import { PATHS } from './config.js';
import type { Checkpoint } from './types.js';

// Persistencia del progreso para reanudación automática.
// Se guarda cada N jugadores y permite continuar desde el último estado
// sin reiniciar desde cero.

export async function loadCheckpoint(): Promise<Checkpoint | null> {
  try {
    const raw = await fs.readFile(PATHS.checkpoint, 'utf8');
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

export async function saveCheckpoint(cp: Checkpoint): Promise<void> {
  await fs.mkdir(PATHS.checkpointsDir, { recursive: true });
  await fs.writeFile(
    PATHS.checkpoint,
    JSON.stringify(cp, null, 2),
    'utf8',
  );
}

export async function clearCheckpoint(): Promise<void> {
  try {
    await fs.unlink(PATHS.checkpoint);
  } catch {
    // no existía: nada que limpiar
  }
}
