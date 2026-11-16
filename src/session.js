import { MAX_INPUT_BYTES, parseProject, STORAGE_KEY } from './state.js?v=0.2.2-dev.0&session=2';

const RECORD_FORMAT = 'muster/session-v1';
const LOCK_NAME = 'muster.project.v1.write';

// Legacy projects remain readable; exported files are still plain models.
export function readStoredProject(raw) {
  const value = parseProject(raw, MAX_INPUT_BYTES + 512);
  if (value?.format === RECORD_FORMAT) {
    if (typeof value.generation !== 'string' || !value.generation || !value.model)
      throw new Error('Saved project generation is invalid.');
    return value.model;
  }
  return value;
}

export class PlanningSession {
  constructor({ storage, locks, uuid, expectedRaw = null }) {
    this.storage = storage;
    this.locks = locks;
    this.uuid = uuid;
    this.expectedRaw = expectedRaw;
    this.tail = Promise.resolve();
  }

  save(model) {
    // Snapshot before enqueueing so later edits cannot mutate an earlier write.
    const snapshot = structuredClone(model);
    const operation = this.tail.then(async () => {
      if (!this.locks?.request || typeof this.uuid !== 'function')
        return { ok: false, kind: 'unavailable', message: 'Safe browser saving is unavailable. Changes are in memory only; export before closing.' };
      try {
        return await this.locks.request(LOCK_NAME, { mode: 'exclusive' }, () => {
          const storage = this.storage();
          if (storage.getItem(STORAGE_KEY) !== this.expectedRaw)
            return { ok: false, kind: 'conflict', message: 'Another tab changed the saved project. Your changes are in memory only; export them or reload the saved project.' };
          const generation = this.uuid();
          if (typeof generation !== 'string' || !generation) throw new Error('Generation unavailable');
          const record = JSON.stringify({ format: RECORD_FORMAT, generation, model: snapshot });
          storage.setItem(STORAGE_KEY, record);
          this.expectedRaw = record;
          return { ok: true };
        });
      } catch {
        return { ok: false, kind: 'unavailable', message: 'Changes are in memory only. Browser storage is unavailable or full; export your project before closing.' };
      }
    });
    this.tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async currentRaw() {
    await this.tail;
    return this.storage().getItem(STORAGE_KEY);
  }

  adopt(raw) { this.expectedRaw = raw; }
  differs(raw) { return raw !== this.expectedRaw; }
}
