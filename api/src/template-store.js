import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';
import { templateIdRe } from './schema.js';

// File-based template store: one JSON file per template in config.templatesDir.
// Persisted via a Docker volume; atomic writes (temp + rename). Best-effort in-memory
// index of ids for fast list() — rebuilt lazily from disk.

const DIR = config.templatesDir;
const ready = fs.mkdir(DIR, { recursive: true })
  .then(() => logger.info({ dir: DIR }, 'template store ready'))
  .catch((err) => logger.error({ err, dir: DIR }, 'template store dir unavailable (writes will fail)'));

function filePath(id) {
  return path.join(DIR, `${id}.json`);
}

function isValidId(id) {
  return typeof id === 'string' && templateIdRe.test(id);
}

function genId(name) {
  const base = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const stem = base || 'tpl';
  const suffix = Date.now().toString(36).slice(-5);
  return `${stem}-${suffix}`;
}

/** Write a template file atomically. */
async function writeAtomic(id, doc) {
  await ready;
  const tmp = path.join(DIR, `.${id}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(doc, null, 2), 'utf8');
  await fs.rename(tmp, filePath(id));
}

/** Public view of a stored template (its id + slot contract). */
function summary(doc) {
  return {
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    slots: doc.slots || [],
  };
}

export async function create(def) {
  await ready;
  const id = def.id || genId(def.name);
  if (!isValidId(id)) {
    const e = new Error('invalid template id'); e.status = 400; e.expose = true; throw e;
  }
  if (await exists(id)) {
    const e = new Error('template id already exists'); e.status = 409; e.expose = true; throw e;
  }
  const doc = { ...def, id, createdAt: Date.now(), updatedAt: Date.now() };
  await writeAtomic(id, doc);
  return doc;
}

export async function get(id) {
  if (!isValidId(id)) return null;
  try {
    const raw = await fs.readFile(filePath(id), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function exists(id) {
  return Boolean(await get(id));
}

export async function list() {
  await ready;
  let names = [];
  try {
    names = await fs.readdir(DIR);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return [];
  }
  const docs = [];
  for (const name of names) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    try {
      docs.push(JSON.parse(await fs.readFile(path.join(DIR, name), 'utf8')));
    } catch { /* skip corrupt file */ }
  }
  return docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function update(id, def) {
  const existing = await get(id);
  if (!existing) return null;
  const doc = {
    ...existing,
    ...def,
    id, // id is immutable
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  await writeAtomic(id, doc);
  return doc;
}

export async function remove(id) {
  if (!isValidId(id)) return false;
  try {
    await fs.unlink(filePath(id));
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

export { summary };
