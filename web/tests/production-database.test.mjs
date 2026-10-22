import test from 'node:test';
import assert from 'node:assert/strict';
import {productionDatabase} from '../scripts/resolve-production-database.mjs';

const db={name:'jobradar-db',uuid:'00000000-0000-4000-8000-000000000001'};
test('production resolves one existing database and ignores unrelated databases',()=>{
  assert.equal(productionDatabase([{name:'other',uuid:'bad'},db]),db.uuid);
});
test('missing, duplicate and malformed production database inventories fail closed',()=>{
  for(const inventory of [null,{},[],[{name:'other'}],[db,db],[{...db,uuid:''}],[{...db,uuid:'not-a-uuid'}]]) {
    assert.throws(()=>productionDatabase(inventory));
  }
});
