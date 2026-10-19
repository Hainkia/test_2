const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.argv[2] || path.resolve(__dirname,'..');
function element() {
  return {value:'',hidden:true,disabled:false,textContent:'',listeners:{},dataset:{},setAttribute(){},prepend(){},querySelector(){return {textContent:''};},addEventListener(type,fn){this.listeners[type]=fn;}};
}
const elements = new Map();
const documentListeners = {};
const document = {
  querySelector(id){if (!elements.has(id)) elements.set(id,element()); return elements.get(id);},
  addEventListener(type,fn){(documentListeners[type] ||= []).push(fn);},
  dispatchEvent(event){for(const fn of documentListeners[event.type]||[])fn(event);},
};
let copied = '';
const context = {document,navigator:{clipboard:{async writeText(text){copied=text;}}},Event:class {constructor(type){this.type=type;}},CustomEvent:class {constructor(type,opts){this.type=type;this.detail=opts.detail;}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),context);
document.querySelector('#charBasis').value='공백 포함';
document.dispatchEvent(new context.CustomEvent('load-final-text',{detail:{text:'생성된 문장'}}));
const editor=document.querySelector('#report');
assert.equal(editor.value,'생성된 문장');
assert.equal(editor.hidden,false);
editor.value='교사가 수정한 최종 문장';
editor.listeners.input();
(async()=>{
  await document.querySelector('#copy-button').listeners.click();
  assert.equal(copied,'교사가 수정한 최종 문장');
  editor.value='   '; editor.listeners.input();
  assert.equal(document.querySelector('#copy-button').disabled,true);
  assert.equal(document.querySelector('#download-button').disabled,true);
  document.dispatchEvent(new context.CustomEvent('final-save-busy',{detail:true}));
  assert.equal(document.querySelector('#generate-button').disabled,true);
  document.dispatchEvent(new context.CustomEvent('final-save-busy',{detail:false}));
  assert.equal(document.querySelector('#generate-button').disabled,false);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const script=fs.readFileSync(path.join(root,'final-records.js'),'utf8');
  for(const match of script.matchAll(/\$\('#([^']+)'\)/g)) assert.ok(html.includes(`id="${match[1]}"`),`Missing UI field ${match[1]}`);
  assert.ok(!script.includes('.innerHTML'));
  assert.ok(script.includes(".eq('updated_at',selected.updated_at)"));
  console.log('PASS: editable final text drives copy, blank text disables exports, DB saving blocks regeneration, UI references and concurrency filter checked.');
})().catch(error=>{console.error(error);process.exitCode=1;});
