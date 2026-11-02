'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {localDate, migratePeriod} = require('./period');

test('reset date follows Zagreb across midnight and summer time', () => {
  assert.equal(localDate(new Date('2026-11-01T23:30:00Z')), '2026-11-02');
  assert.equal(localDate(new Date('2026-07-01T22:30:00Z')), '2026-07-02');
});

test('existing reset is recovered from latest archive without changing counts', () => {
  const db = {week:'2026-10-26', weekly:{125:3}, history:{
    [`2026-10-26-manual-${Date.parse('2026-11-01T23:30:00Z')}`]:{125:7},
    [`2026-10-26-manual-${Date.parse('2026-10-28T10:00:00Z')}`]:{125:2},
  }};
  assert.equal(migratePeriod(db), true);
  assert.equal(db.week, '2026-11-02');
  assert.deepEqual(db.weekly, {125:3});
  assert.equal(migratePeriod(db), false);
});

test('without a full reset the original period is preserved', () => {
  const db = {week:'2026-10-26', history:{'2026-10-19':{125:1}},
    audit:[{type:'RESET', details:'Značka 125: 3 popravaka'}]};
  assert.equal(migratePeriod(db), false);
  assert.equal(db.week, '2026-10-26');
});
