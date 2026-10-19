// Two explicit fail-open mutants in owned temporary copies, never product files.
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import nacl from 'tweetnacl';
import base64js from 'base64-js';
import { alterations,makeSealedFixture } from './helpers/sealed-crypto-cases.mjs';
globalThis.window={nacl};globalThis.base64js=base64js;
const original=await import('../static/js/crypto.js');
const source=await readFile(new URL('../static/js/crypto.js',import.meta.url),'utf8');
const directory=await mkdtemp(join(tmpdir(),'hp2p-sealed-control-'));
try{
 await writeFile(join(directory,'package.json'),'{"type":"module"}');
 for(const [kind,name] of [['private','decryptChannelMessage'],['direct','decryptDirectMessage']]){
  const start=source.indexOf('export function '+name+'('),end=source.indexOf('\n}',start)+2;
  assert.ok(start>=0&&end>start);
  const body=source.slice(start,end),guard='if (!decrypted) return null;';
  assert.equal(body.split(guard).length,2,'Exactly one authentication-failure branch in the selected function');
  const mutated=source.slice(0,start)+body.replace(guard,"if (!decrypted) return 'UNAUTHENTICATED TEST SENTINEL';")+source.slice(end);
  const path=join(directory,kind+'.js');await writeFile(path,mutated);
  const mutant=await import(pathToFileURL(path));const fixture=makeSealedFixture(original,kind);
  assert.equal(fixture.decrypt(original,fixture.payload),fixture.plaintext);
  assert.equal(fixture.decrypt(mutant,fixture.payload),fixture.plaintext);
  // These well-formed bit flips reach the authentication-failure branch; malformed
  // lengths can throw before it and are not claimed as killed by this mutant.
  for(const [label,field,alter] of alterations.filter(row=>['ciphertext tag bit','ciphertext body bit','nonce first bit','nonce last bit'].includes(row[0]))){
   const payload={...fixture.payload,[field]:alter(fixture.payload[field])};
   assert.equal(fixture.decrypt(original,payload),null,`${kind}: ${label}`);
   assert.equal(fixture.decrypt(mutant,payload),'UNAUTHENTICATED TEST SENTINEL',`${kind}: probe must distinguish fail-open mutant`);
  }
 }
 console.log('Sealed mutation controls passed: both fail-open mutants distinguished by four bit-flip probes each.');
}finally{await rm(directory,{recursive:true,force:true});}
