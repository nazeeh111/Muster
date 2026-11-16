import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
function segment(begin, end) {
  const start=source.indexOf(begin), stop=source.indexOf(end,start);
  assert.ok(start>=0 && stop>start, `actual source segment ${begin}`);
  return source.slice(start,stop);
}
function deferred() { let resolve; const promise=new Promise(r=>{resolve=r});return {promise,resolve}; }
function acceptContext() {
  const dialog=deferred(), nodes={accept:{}}, messages=[], applied=[];
  const proposal={assignments:[{positionId:'p',personId:'a'}]};
  const ctx={Map,$:id=>nodes[id],result:proposal,revision:7,ask:()=>dialog.promise,
    message:(...x)=>messages.push(x),apply:fn=>{const data={positions:[{id:'p'}]};fn(data);applied.push(data);},calculate:()=>{}};
  vm.createContext(ctx);
  vm.runInContext(segment('$("accept").onclick = async () => {','\n$("project-json").oninput'),ctx);
  return {ctx,dialog,nodes,messages,applied,proposal};
}
for (const change of ['cleared', 'revision', 'replaced']) {
  test(`actual accept handler refuses ${change} proposal while dialog waits`, async () => {
    const {ctx,dialog,nodes,messages,applied}=acceptContext();
    const pending=nodes.accept.onclick();
    if(change==='cleared')ctx.result=null;
    if(change==='revision')ctx.revision++;
    if(change==='replaced')ctx.result={assignments:[{positionId:'p',personId:'b'}]};
    dialog.resolve(true);await pending;
    assert.equal(applied.length,0);assert.match(messages[0][0],/proposal changed/i);
  });
}
test('actual accept handler applies only the confirmed current proposal', async () => {
  const {dialog,nodes,applied}=acceptContext();const pending=nodes.accept.onclick();dialog.resolve(true);await pending;
  assert.equal(applied.length,1);assert.equal(applied[0].positions[0].previousPersonId,'a');
});

test('actual replacement refuses a project revision changed during confirmation', async () => {
  const dialog=deferred(), nodes={'editor':{open:false},'project-json':{value:'draft'}}, messages=[], updated=[];
  const ctx={$:id=>nodes[id],revision:3,ask:()=>dialog.promise,message:(...x)=>messages.push(x),validateModel:()=>{},update:x=>updated.push(x)};
  vm.createContext(ctx);
  vm.runInContext(segment('function staleNotice() {','\nfunction download(')+segment('async function replaceProject(', '\n$("editor-form").onsubmit'),ctx);
  const pending=ctx.replaceProject({title:'replacement'});ctx.revision++;dialog.resolve(true);
  assert.equal(await pending,false);assert.equal(updated.length,0);assert.match(messages[0][0],/changed while confirmation/i);
});

test('actual JSON replacement refuses a draft changed during confirmation', async () => {
  const dialog=deferred(), nodes={'editor':{open:false},'project-json':{value:'first'}}, messages=[], updated=[];
  const ctx={$:id=>nodes[id],revision:3,ask:()=>dialog.promise,message:(...x)=>messages.push(x),validateModel:()=>{},update:x=>updated.push(x)};
  vm.createContext(ctx);vm.runInContext(segment('function staleNotice() {','\nfunction download(')+segment('async function replaceProject(', '\n$("editor-form").onsubmit'),ctx);
  const pending=ctx.replaceProject({title:'replacement'},'first');nodes['project-json'].value='newer unsaved draft';dialog.resolve(true);
  assert.equal(await pending,false);assert.equal(updated.length,0);assert.match(messages[0][0],/changed while confirmation/i);
});

test('actual editor rejects a form opened on an older revision without clearing entries', () => {
  const nodes={'editor-form':{},editor:{close(){throw Error('must stay open');}},'editor-error':{textContent:''}};
  let saves=0;const ctx={$:id=>nodes[id],editorRevision:2,revision:3,editorSave:()=>saves++,message:()=>{},FormData:class{}};
  vm.createContext(ctx);vm.runInContext(segment('$("editor-form").onsubmit =', '\n$("delete-item").onclick'),ctx);
  nodes['editor-form'].onsubmit({preventDefault(){},currentTarget:{}});
  assert.equal(saves,0);assert.match(nodes['editor-error'].textContent,/changed while this editor was open/i);
});

test('actual draft discard retains text changed during confirmation', async () => {
  const dialog=deferred(), nodes={'discard-json':{},'project-json':{value:'old'},editor:{open:false}}, messages=[];
  let renders=0;const ctx={$:id=>nodes[id],revision:2,jsonDirty:true,ask:()=>dialog.promise,message:(...x)=>messages.push(x),render:()=>renders++};
  vm.createContext(ctx);vm.runInContext(segment('function staleNotice() {','\nfunction download(')+segment('$("discard-json").onclick =', '\n$("apply-json").onclick'),ctx);
  const pending=nodes['discard-json'].onclick();nodes['project-json'].value='new';dialog.resolve(true);await pending;
  assert.equal(ctx.jsonDirty,true);assert.equal(renders,0);assert.match(messages[0][0],/changed while confirmation/i);
});

test('actual reload refuses revision change during confirmation before reading storage', async () => {
  const dialog=deferred(), nodes={'reload-saved':{},'project-json':{value:'draft'},editor:{open:false}}, messages=[];
  let reads=0;const ctx={$:id=>nodes[id],revision:1,ask:()=>dialog.promise,message:(...x)=>messages.push(x),session:{currentRaw:()=>{reads++;}}};
  vm.createContext(ctx);vm.runInContext(segment('function staleNotice() {','\nfunction download(')+segment('$("reload-saved").onclick =', '\n$("csv").onclick'),ctx);
  const pending=nodes['reload-saved'].onclick();ctx.revision++;dialog.resolve(true);await pending;
  assert.equal(reads,0);assert.match(messages[0][0],/changed while confirmation/i);
});

test('actual file reader refuses a changed worksheet before asking replacement', async () => {
  const read=deferred(), nodes={file:{}}, messages=[];let replacements=0;
  const ctx={$:id=>nodes[id],revision:4,MAX_INPUT_BYTES:1024,message:(...x)=>messages.push(x),parseProject:JSON.parse,replaceProject:()=>replacements++};
  vm.createContext(ctx);vm.runInContext(segment('$("file").onchange =', '\n$("recover-download").onclick'),ctx);
  const pending=nodes.file.onchange({target:{files:[{size:10,text:()=>read.promise}],value:'file'}});
  ctx.revision++;read.resolve('{"a":1}');await pending;
  assert.equal(replacements,0);assert.match(messages[0][0],/changed while reading/i);
});

test('actual confirmation helper refuses a changed worksheet and leaves editor open', async () => {
  const dialog=deferred(), nodes={editor:{open:true},'editor-error':{textContent:''}}, messages=[];
  const ctx={$:id=>nodes[id],revision:1,ask:()=>dialog.promise,message:(...x)=>messages.push(x)};
  vm.createContext(ctx);vm.runInContext(segment('function staleNotice() {','\nfunction download('),ctx);
  const pending=ctx.askCurrent('Remove item?');ctx.revision++;dialog.resolve(true);
  assert.equal(await pending,false);assert.match(nodes['editor-error'].textContent,/changed while confirmation/i);
});
