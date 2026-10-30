'use strict';

function addPlayerRepair(state, badge, user, amount) {
  const players = state.playersByBadge[badge] ||= {};
  players[user] = (players[user] || 0) + amount;
}

// Recover only attribution supported by the retained audit log.
function migratePlayers(state) {
  if (state.playersByBadge) return false;
  state.playersByBadge = {};
  for (const event of state.audit || []) {
    if (event.type === 'ADD') {
      const match = /^Značka ([a-zA-Z0-9_. -]{1,20}), \+(\d+)$/.exec(event.details);
      if (match && /^\d+$/.test(event.user)) addPlayerRepair(state, match[1], event.user, Number(match[2]));
    } else if (event.type === 'RESET') {
      if (event.details.startsWith('Sve značke:')) state.playersByBadge = {};
      else {
        const match = /^Značka ([a-zA-Z0-9_. -]{1,20}):/.exec(event.details);
        if (match) delete state.playersByBadge[match[1]];
      }
    }
  }
  for (const [badge, players] of Object.entries(state.playersByBadge)) {
    const total = Object.values(players).reduce((a, b) => a + b, 0);
    if (!Object.hasOwn(state.weekly, badge) || total > state.weekly[badge]) delete state.playersByBadge[badge];
  }
  return true;
}

function playerTotals(state) {
  const totals = {};
  for (const players of Object.values(state.playersByBadge)) {
    for (const [user, amount] of Object.entries(players)) totals[user] = (totals[user] || 0) + amount;
  }
  return totals;
}

function rankingLines(entries, format, empty) {
  const sorted = entries.sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], undefined, {numeric:true}));
  let result = '';
  for (let index = 0; index < sorted.length; index++) {
    const line = format(...sorted[index]);
    const remaining = `\n… još ${sorted.length-index} (spremljeno u evidenciji)`;
    if (result.length + line.length + 1 + 60 > 1024) return result + remaining;
    result += (result ? '\n' : '') + line;
  }
  return result || empty;
}

module.exports = {addPlayerRepair, migratePlayers, playerTotals, rankingLines};
