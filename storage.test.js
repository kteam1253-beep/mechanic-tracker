'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createStorage} = require('./storage');

test('local state survives restart', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repairs-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const options = {file:path.join(dir, 'data.json'), defaults:()=>({weekly:{}})};
  const store = await createStorage(options);
  await store.save({weekly:{125:3}});
  assert.deepEqual((await createStorage(options)).state.weekly, {125:3});
});

function database(initial) {
  let row = initial;
  return {
    async query() {}, async end() {},
    async execute(sql, values) {
      if (sql.startsWith('SELECT')) return [row ? [structuredClone(row)] : []];
      if (sql.startsWith('INSERT')) { row ||= {payload:JSON.parse(values[1]), revision:0}; return [{}]; }
      if (sql.startsWith('UPDATE')) {
        if (row.revision !== values[2]) return [{affectedRows:0}];
        row = {payload:JSON.parse(values[0]), revision:row.revision+1};
        return [{affectedRows:1}];
      }
      throw Error('Unexpected SQL');
    },
  };
}
test('MySQL imports once, saves snapshots in order and rejects stale writers', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repairs-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify({weekly:{125:4}}));
  const pool = database();
  const options = {url:'mysql://test', file, key:'guild', defaults:()=>({weekly:{}}), createPool:()=>pool};
  const store = await createStorage(options);
  assert.deepEqual(store.state.weekly, {125:4});
  const stale = await createStorage(options);
  store.state.weekly[125] = 5;
  const first = store.save(store.state);
  store.state.weekly[125] = 6;
  await Promise.all([first, store.save(store.state)]);
  fs.writeFileSync(file, 'invalid local JSON must be ignored');
  assert.deepEqual((await createStorage(options)).state.weekly, {125:6});
  await assert.rejects(stale.save({weekly:{}}), /Druga instanca/);
  await assert.rejects(stale.save({weekly:{}}), /Druga instanca/);
  assert.deepEqual((await createStorage(options)).state.weekly, {125:6});
});

test('configured MySQL failure never falls back to local storage', async () => {
  await assert.rejects(createStorage({url:'mysql://test', createPool:()=>({
    async query(){throw Error('offline');}, async end(){},
  })}), /offline/);
});
