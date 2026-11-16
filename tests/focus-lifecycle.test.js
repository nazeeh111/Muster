import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function section(start,end) { const a=source.indexOf(start),b=source.indexOf(end,a); assert.ok(a>=0 && b>a); return source.slice(a,b); }
function setup() {
  const handlers=new Map(),body={},solve={disabled:true,focus(){ doc.activeElement=this; }},cancel={hidden:false};
  const doc={body,activeElement:body,hasFocus:()=>true,
    addEventListener(type,fn){const items=handlers.get(type)||new Set();items.add(fn);handlers.set(type,items);},
    removeEventListener(type,fn){handlers.get(type)?.delete(fn);},
    querySelectorAll(){return this.candidates||[];},
    fire(type){for(const f of handlers.get(type)||[])f({type});}};
  const ctx={document:doc,worker:null,timer:null,clearTimeout:()=>{},$:id=>({solve,cancel}[id])};vm.createContext(ctx);
  vm.runInContext(section('let solveFocusWatch = null','const counted')+section('function stop(', '\nfunction update('),ctx);
  return {ctx,doc,solve,cancel};
}
test('worker completion restores focused Calculate only when no later interaction occurred',()=>{
  const {ctx,doc,solve}=setup();vm.runInContext('solveFocusWatch = watchFocusActivity(); stop(true);',ctx);
  assert.equal(doc.activeElement,solve);assert.equal(solve.disabled,false);
});
test('worker completion does not take focus after pointer, key, or focus activity',()=>{
  for(const event of ['pointerdown','keydown','focusin']){
    const {ctx,doc,solve}=setup();vm.runInContext('solveFocusWatch = watchFocusActivity()',ctx);doc.fire(event);vm.runInContext('stop(true)',ctx);
    assert.equal(doc.activeElement,doc.body,event);assert.equal(solve.disabled,false);
  }
});
test('ending a stale or cancelled calculation never restores focus',()=>{
  const {ctx,doc}=setup();vm.runInContext('solveFocusWatch = watchFocusActivity(); stop();',ctx);assert.equal(doc.activeElement,doc.body);
});
test('editor close returns to the newly rendered matching trigger, unless user moved',()=>{
  for(const moved of [false,true]){
    const {ctx,doc}=setup();let focused=0;
    const target={isConnected:true,getAttribute:n=>n==='data-focus-key'?'person-edit:cy':null,focus(){focused++;doc.activeElement=this;}};
    const callbacks={},editor={addEventListener:(name,fn)=>{callbacks[name]=fn;},close(){},contains:()=>false,open:false};
    doc.candidates=[target];ctx.$=id=>id==='editor'?editor:null;
    vm.runInContext(section('function beginEditorClose()', '\nasync function replaceProject('),ctx);
    vm.runInContext('editorReturn = {key:"person-edit:cy"}; beginEditorClose()',ctx);
    if(moved)doc.fire('pointerdown');callbacks.close();
    assert.equal(focused,moved?0:1);
  }
});

test('a save-triggered rerender preserves a focused replacement control',()=>{
  const old={getAttribute:n=>n==='data-focus-key'?'person-edit:cy':null};
  const replacement={getAttribute:n=>n==='data-focus-key'?'person-edit:cy':null,focus(){doc.activeElement=this;}};
  const body={}; const doc={body,activeElement:old,hasFocus:()=>true,querySelectorAll:()=>[replacement]};
  const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false,value:'',replaceChildren(){},append(){}});return nodes.get(id);};
  const ctx={document:doc,$:get,model:{title:'test',format:'muster/v1',blocks:[],positions:[]},result:null,history:[],synthetic:false,saveMessage:'Saved',jsonDirty:false,
    counted:(n,w)=>`${n} ${w}`,el:()=>({}),label:()=>'',renderExplanation:()=>{},
    renderPeople:()=>{doc.activeElement=body;},renderSetup:()=>{}};
  vm.createContext(ctx);vm.runInContext(section('function focusKey(', 'const counted')+section('function render() {','\nfunction renderExplanation()'),ctx);
  ctx.render();assert.equal(doc.activeElement,replacement);
});

test('editor Save restores the trigger when native focus is still inside the just-closed dialog',()=>{
  const {ctx,doc}=setup();let focused=0;
  const target={isConnected:true,getAttribute:n=>n==='data-focus-key'?'person-edit:cy':null,focus(){focused++;doc.activeElement=this;}};
  const saveButton={},callbacks={},editor={addEventListener:(name,fn)=>{callbacks[name]=fn;},close(){},contains:node=>node===saveButton,open:false};
  doc.activeElement=saveButton;doc.candidates=[target];ctx.$=id=>id==='editor'?editor:null;
  vm.runInContext(section('function beginEditorClose()', '\nasync function replaceProject('),ctx);
  vm.runInContext('editorReturn = {key:"person-edit:cy"}; beginEditorClose()',ctx);callbacks.close();
  assert.equal(focused,1);
});

test('editor close does not take focus from an outside control',()=>{
  const {ctx,doc}=setup();let focused=0;const outside={};
  const target={isConnected:true,getAttribute:()=>"person-edit:cy",focus(){focused++;}};
  const callbacks={},editor={addEventListener:(name,fn)=>{callbacks[name]=fn;},contains:()=>false,close(){},open:false};
  doc.activeElement=outside;doc.candidates=[target];ctx.$=id=>id==='editor'?editor:null;
  vm.runInContext(section('function beginEditorClose()', '\nasync function replaceProject('),ctx);
  vm.runInContext('editorReturn = {key:"person-edit:cy"}; beginEditorClose()',ctx);callbacks.close();
  assert.equal(focused,0);assert.equal(doc.activeElement,outside);
});

test('queued close events cannot restore an earlier editor after a newer editor closes',()=>{
  const {ctx,doc}=setup();const focused=[];const field={};
  const previous={isConnected:true,getAttribute:()=>"person-edit:cy",focus(){focused.push('previous');}};
  const current={isConnected:true,getAttribute:()=>"person-edit:ada",focus(){focused.push('current');}};
  const callbacks={},editor={addEventListener:(name,fn)=>{callbacks[name]=fn;},contains:n=>n===field,close(){},open:false};
  doc.activeElement=field;doc.candidates=[previous,current];ctx.$=id=>id==='editor'?editor:null;
  vm.runInContext(section('function beginEditorClose()', '\nasync function replaceProject('),ctx);
  vm.runInContext('editorReturn = {key:"person-edit:cy"}; beginEditorClose(); editorGeneration++; editorReturn = {key:"person-edit:ada"}; beginEditorClose()',ctx);
  callbacks.close();assert.deepEqual(focused,[]);callbacks.close();assert.deepEqual(focused,['current']);
});
