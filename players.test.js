'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {addPlayerRepair, migratePlayers, playerTotals, rankingLines} = require('./players');

test('counts quantities across badges and players; survives reload and resets', () => {
  let state = {weekly:{}, audit:[]};
  migratePlayers(state);
  addPlayerRepair(state,'001','123',5);
  addPlayerRepair(state,'001','456',2);
  addPlayerRepair(state,'010','123',3);
  state = JSON.parse(JSON.stringify(state));
  assert.equal(migratePlayers(state),false);
  assert.deepEqual(playerTotals(state),{'123':8,'456':2});
  delete state.playersByBadge['001'];
  assert.deepEqual(playerTotals(state),{'123':3});
  state.playersByBadge = {};
  assert.deepEqual(playerTotals(state),{});
});

test('migration respects resets and leaves missing or inconsistent attribution unknown', () => {
  const add = (badge, user, amount) => ({type:'ADD',user,details:`Značka ${badge}, +${amount}`});
  const state = {weekly:{'001':7,'010':5,'020':1},audit:[
    add('001','123',10),{type:'RESET',details:'Sve značke: 10 popravaka'},
    add('001','456',3),{type:'RESET',details:'Značka 001: 3 popravaka'},
    add('001','123',2),add('010','456',5),add('020','123',9),add('030','456',3),
  ]};
  assert.equal(migratePlayers(state),true);
  assert.deepEqual(playerTotals(state),{'123':2,'456':5});
  assert.equal(migratePlayers(state),false);
});

test('rankings sort by quantity and stay within embed field size', () => {
  assert.equal(rankingLines([['1',2],['2',5]],(id,n)=>`${id}: ${n}`,'empty'),'2: 5\n1: 2');
  assert.equal(rankingLines([],()=>'', 'empty'),'empty');
  const result = rankingLines(Array.from({length:500},(_,i)=>[String(100000000000000000n+BigInt(i)),999999]),(id,n)=>`🔧 <@${id}> — **${n}**`,'empty');
  assert.ok(result.length<=1024);
  assert.match(result,/još/);
});
