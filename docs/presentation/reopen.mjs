// Run from any directory: node /path/to/extracted/reopen.mjs. No install step.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {solve} from './app/src/solver.js';
import {parseProject,assignmentsCsv} from './app/src/state.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'MANIFEST.json')));
for(const f of manifest.files){assert(!path.isAbsolute(f.path)&&!f.path.split('/').includes('..'));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f.path))).digest('hex'),f.sha256,f.path);}
const read=(name)=>parseProject(fs.readFileSync(path.join(root,name),'utf8'));
const observed={};
for(const name of ['before','after']){
 const model=read(name+'-project.json'),result=solve(model),saved=JSON.parse(fs.readFileSync(path.join(root,name+'-result.json')));
 assert.deepEqual(result,saved);assert.equal(assignmentsCsv(model,result),fs.readFileSync(path.join(root,name+'-assignments.csv'),'utf8'));
 observed[name]={filled:result.assignments.length,objective:result.objective,shortage:result.shortage};
}
const browser=read('browser-project.json');assert.deepEqual(browser,read('after-project.json'));
assert.equal(assignmentsCsv(browser,solve(browser)),fs.readFileSync(path.join(root,'browser-assignments.csv'),'utf8'));
assert.throws(()=>parseProject('{"format":"muster/v1","format":"muster/v2"}'));
assert.throws(()=>solve({...browser,unknown:true}));
console.log(JSON.stringify({files:manifest.files.length,observed,source:'Unmodified Muster modules at aed0636566e7936c996564beeecb9c69172ea3a6',scope:'Named-block synthetic rota. Not all timed-mode behavior, consent or real-world staffing feasibility.'},null,2));
