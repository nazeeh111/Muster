import test from 'node:test';
import assert from 'node:assert/strict';
import { PlanningSession, readStoredProject } from '../src/session.js';
import { STORAGE_KEY } from '../src/state.js';

function environment() {
  let raw = null, fail = null, counter = 0, tail = Promise.resolve();
  const storage = {
    getItem(key) { assert.equal(key, STORAGE_KEY); if (fail === 'read') throw Error('denied'); return raw; },
    setItem(key, value) { assert.equal(key, STORAGE_KEY); if (fail === 'write') throw Error('quota'); raw = value; },
  };
  const locks = { request(_name, options, fn) {
    assert.equal(options.mode, 'exclusive');
    const task = tail.then(async () => { await Promise.resolve(); return fn(); });
    tail = task.then(() => undefined, () => undefined); return task;
  }};
  const session = () => new PlanningSession({storage: () => storage, locks, uuid: () => `generation-${++counter}`, expectedRaw: raw});
  return {storage, locks, session, raw: () => raw, fail: value => { fail = value; }};
}
const model = title => ({format: 'muster/v1', title, roles: [], blocks: [], people: [], positions: []});

test('two concurrent saves serialize; losing state remains available', async () => {
  const e = environment(), initial = e.session();
  assert.equal((await initial.save(model('baseline'))).ok, true);
  const a = e.session(), b = e.session(), draftA = model('tab A'), draftB = model('tab B');
  const [one, two] = await Promise.all([a.save(draftA), b.save(draftB)]);
  assert.equal(one.ok, true); assert.equal(two.kind, 'conflict');
  assert.equal(readStoredProject(e.raw()).title, 'tab A');
  assert.equal(draftB.title, 'tab B');
});

test('stale edits, import, reset and undo cannot replace another generation', async () => {
  for (const action of ['edit','import','reset','undo']) {
    const e=environment(), seed=e.session(); await seed.save(model('baseline'));
    const a=e.session(), b=e.session(); await a.save(model('durable from A'));
    const durable=e.raw(), local=model(`B ${action}`);
    assert.equal((await b.save(local)).kind, 'conflict', action);
    assert.equal(e.raw(),durable,action); assert.equal(local.title,`B ${action}`);
    const reloaded=await b.currentRaw(); assert.equal(readStoredProject(reloaded).title,'durable from A');
    b.adopt(reloaded); assert.equal((await b.save(model('after explicit reload'))).ok,true);
  }
});

test('generation prevents A to B to A from passing stale comparison', async () => {
  const e=environment(), a=e.session(); await a.save(model('A')); const stale=e.session();
  await a.save(model('B')); await a.save(model('A'));
  assert.equal((await stale.save(model('stale'))).kind,'conflict');
  assert.equal(readStoredProject(e.raw()).title,'A');
});

test('queued same-tab writes take snapshots and settle in order', async () => {
  const e=environment(), s=e.session(), first=model('first');
  const p=s.save(first); first.title='mutated after save call';
  const q=s.save(model('second')); assert.equal((await p).ok,true);assert.equal((await q).ok,true);
  assert.equal(readStoredProject(e.raw()).title,'second');
});

test('quota and unavailable locks retain prior bytes and permit safe retry', async () => {
  const e=environment(), s=e.session(); await s.save(model('prior')); const previous=e.raw();
  e.fail('read'); assert.equal((await s.save(model('draft'))).kind,'unavailable');
  e.fail('write'); assert.equal((await s.save(model('draft'))).kind,'unavailable');
  e.fail(null); assert.equal(e.raw(),previous); assert.equal((await s.save(model('draft'))).ok,true);
  const noLock=new PlanningSession({storage:()=>e.storage,locks:null,uuid:()=> 'x',expectedRaw:e.raw()});
  const safe=e.raw(); assert.equal((await noLock.save(model('unsafe'))).kind,'unavailable');assert.equal(e.raw(),safe);
  const noUuid=new PlanningSession({storage:()=>e.storage,locks:e.locks,uuid:null,expectedRaw:e.raw()});
  assert.equal((await noUuid.save(model('unsafe'))).kind,'unavailable');assert.equal(e.raw(),safe);
});

test('legacy records remain readable and next save creates a fresh generation', async () => {
  const e=environment(), old=JSON.stringify(model('legacy')); e.storage.setItem(STORAGE_KEY,old);
  assert.equal(readStoredProject(old).title,'legacy'); const s=e.session();
  assert.equal((await s.save(model('updated'))).ok,true);
  const saved=JSON.parse(e.raw()); assert.equal(saved.format,'muster/session-v1');
  assert.equal(saved.generation,'generation-1'); assert.equal(saved.model.title,'updated');
});

test('accepted reference survives reopen, availability change, replan and accept', async () => {
  const { example } = await import('../src/example.js');
  const { solve } = await import('../src/solver.js');
  const { validateModel } = await import('../src/model.js');
  const e=environment(), original=example(), first=solve(original,{budgetMs:6500});
  const accepted=structuredClone(original), assignments=new Map(first.assignments.map(x=>[x.positionId,x.personId]));
  accepted.positions.forEach(p=>{p.previousPersonId=assignments.get(p.id)??null;});
  validateModel(accepted); const writer=e.session(); await writer.save(accepted);
  const stored=e.raw(), reopened=readStoredProject(stored), references=JSON.stringify(reopened.positions.map(p=>p.previousPersonId));
  reopened.people.find(p=>p.id==='ada').availability=[];
  validateModel(reopened); const proposed=solve(reopened,{budgetMs:6500});
  assert.equal(JSON.stringify(reopened.positions.map(p=>p.previousPersonId)),references);
  assert.equal(proposed.assignments.some(a=>a.positionId==='collection' && a.personId==='ada'),false);
  assert.equal(proposed.assignments.find(a=>a.positionId==='welcome')?.personId,'bob');
  const changed=reopened.positions.filter(p=>(proposed.assignments.find(a=>a.positionId===p.id)?.personId??null)!==(p.previousPersonId??null));
  assert.ok(changed.length>0);
  const replan=e.session(); assert.equal((await replan.save(reopened)).ok,true);
  const durable=readStoredProject(e.raw());assert.equal(JSON.stringify(durable.positions.map(p=>p.previousPersonId)),references);
  const next=new Map(proposed.assignments.map(x=>[x.positionId,x.personId]));
  durable.positions.forEach(p=>{p.previousPersonId=next.get(p.id)??null;});
  assert.equal((await replan.save(durable)).ok,true);
  assert.deepEqual(readStoredProject(e.raw()).positions.map(p=>p.previousPersonId),durable.positions.map(p=>p.previousPersonId));
});


test('malformed saved records are never silently treated as a project', () => {
  assert.throws(() => readStoredProject(''));
  assert.throws(() => readStoredProject('{"format":"muster/session-v1","generation":"","model":{}}'));
});
