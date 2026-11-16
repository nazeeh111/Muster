import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('a failed worker startup clears the calculating status and retains inputs', () => {
  const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const start=source.indexOf('function calculate() {');
  const end=source.indexOf('\nfunction render() {',start);
  assert.ok(start>=0 && end>start);
  const nodes={'result-status':{textContent:''},solve:{disabled:false},cancel:{hidden:true}};
  const messages=[];let renders=0;
  const context={document:{activeElement:null,body:{}},URL,model:{id:'unchanged'},result:null,revision:0,worker:null,timer:null,
    validateModel:()=>{}, clone:x=>x, $:id=>nodes[id],
    Worker:class { constructor(){throw new Error('worker unavailable');} },
    stop:()=>{nodes.solve.disabled=false;nodes.cancel.hidden=true;},
    render:()=>{renders++;nodes['result-status'].textContent='No current proposal';},
    message:(...args)=>messages.push(args),setTimeout,clearTimeout};
  vm.createContext(context);
  vm.runInContext(source.slice(start,end).replace('import.meta.url', '"http://localhost/"'),context);
  context.calculate();
  assert.equal(context.model.id,'unchanged');
  assert.equal(nodes.solve.disabled,false);
  assert.equal(nodes.cancel.hidden,true);
  assert.equal(nodes['result-status'].textContent,'No current proposal');
  assert.equal(renders,2);
  assert.match(messages[0][0],/solver could not start/i);
});
