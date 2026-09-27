import test from 'node:test';
import assert from 'node:assert/strict';
import {csvCell, assignmentsCsv, parseProject, saveModel} from '../src/state.js';

test('CSV protects formula-like user names while retaining quoting and lines', () => {
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  assert.equal(csvCell(' \t@command'), '"\' \t@command"');
  assert.equal(csvCell('Ada, "A"'), '"Ada, ""A"""');
});
test('invalid imports are rejected before replacing any model', () => {
  assert.throws(() => parseProject('{"title":"first","title":"last"}'), /Duplicate/);
  assert.throws(() => parseProject('{"name":1,"n\\u0061me":2}'), /Duplicate/);
  assert.throws(() => parseProject('['.repeat(70)+'0'+']'.repeat(70)), /deep/);
  assert.throws(() => parseProject(' '.repeat(1048577)), /large/);
});
test('parse keeps ordinary nested values and strings untouched', () => {
  assert.deepEqual(parseProject('{"a":[{"b":"brace } and quote \\\""}],"c":null}'), {a:[{b:'brace } and quote "'}],c:null});
});
test('storage failure returns a usable error without claiming a save', () => {
  const storage={setItem(){throw new Error('quota');}};
  assert.equal(saveModel(storage,{title:'a'}).ok,false);
  const writes=[];
  assert.deepEqual(saveModel({setItem:(...x)=>writes.push(x)},{title:'a'}),{ok:true});
  assert.equal(JSON.parse(writes[0][1]).title,'a');
});
test('CSV includes unfilled positions and lock status', () => {
  const model={roles:[{id:'r',label:'Driver'}],blocks:[{id:'b',label:'Saturday'}],people:[{id:'p',name:'=Ada'}],positions:[{id:'x',label:'Delivery',roleId:'r',blockId:'b',lockedPersonId:'p'},{id:'y',label:'Pickup',roleId:'r',blockId:'b'}]};
  const csv=assignmentsCsv(model,{assignments:[{positionId:'x',personId:'p'}]});
  assert.match(csv, /'=Ada/); assert.match(csv, /Unfilled/);assert.match(csv, /Locked/);
});
