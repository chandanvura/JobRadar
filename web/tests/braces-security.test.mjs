import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const braces = require('braces');
const blocked = error => error instanceof SyntaxError && /nesting limit/.test(error.message);
for (const api of ['parse', 'compile', 'stringify', 'expand']) {
  test(`braces ${api} rejects pathological strings before stack overflow`, () => {
    assert.throws(() => braces[api]('{'.repeat(4500)+'a,b'+'}'.repeat(4500)), blocked);
    assert.throws(() => braces[api]('('.repeat(4500)+'a'+')'.repeat(4500)), blocked);
  });
}
for (const api of ['compile', 'stringify', 'expand']) {
  test(`braces ${api} guards direct AST recursion`, () => {
    const ast = braces.parse('{'.repeat(20)+'a,b'+'}'.repeat(20));
    let node = ast;
    for (let i=0;i<150;i++) {
      const parent = {type:'root', nodes:[node]};
      node.parent = parent;
      node = parent;
    }
    assert.throws(() => braces[api](node), blocked);
  });
}
test('ordinary globs, nesting and range expansion preserve behavior', () => {
  assert.deepEqual(braces.expand('src/{app,lib}/file-{1..3}.ts'), [
    'src/app/file-1.ts','src/app/file-2.ts','src/app/file-3.ts',
    'src/lib/file-1.ts','src/lib/file-2.ts','src/lib/file-3.ts']);
  assert.equal(braces.compile('a/{b,{c,d}}'), 'a/(b|(c|d))');
  assert.equal(braces.stringify('a/{b,c}'), 'a/{b,c}');
  assert.deepEqual(braces.expand('{'.repeat(20)+'a,b'+'}'.repeat(20)).length,2);
});
test('install mitigation is idempotent', () => {
  const output=execFileSync(process.execPath,['scripts/patch-braces.mjs'], {cwd:new URL('..',import.meta.url), encoding:'utf8', timeout:10000});
  assert.match(output,/Verified braces depth mitigation/);
});

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
for (const variant of ['unknown-version', 'modified-source']) {
  test(`install rejects ${variant}`, () => {
    const root=mkdtempSync(join(tmpdir(),'jobradar-braces-'));
    try {
      for (const folder of ['scripts','security','node_modules/braces/lib']) mkdirSync(join(root,folder),{recursive:true});
      for (const path of ['scripts/patch-braces.mjs','security/braces-depth-patch.json']) writeFileSync(join(root,path),readFileSync(new URL('../'+path,import.meta.url)));
      writeFileSync(join(root,'node_modules/braces/package.json'),JSON.stringify({name:'braces',version:variant==='unknown-version'?'99.0.0':'3.0.3'}));
      writeFileSync(join(root,'node_modules/braces/lib/parse.js'),'unexpected source');
      assert.throws(()=>execFileSync(process.execPath,[join(root,'scripts/patch-braces.mjs')],{stdio:'pipe',timeout:10000}), error=>error.status===1 && /Review braces mitigation|Unrecognized braces source/.test(error.stderr.toString()));
    } finally {rmSync(root,{recursive:true,force:true});}
  });
}
