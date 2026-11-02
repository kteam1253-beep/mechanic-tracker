'use strict';

function localDate(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function migratePeriod(db) {
  const timestamps = Object.keys(db.history || {})
    .map(key => /-manual-(\d+)$/.exec(key))
    .filter(Boolean)
    .map(match => Number(match[1]))
    .filter(value => Number.isFinite(new Date(value).getTime()));
  if (!timestamps.length) return false;
  const date = localDate(new Date(Math.max(...timestamps)));
  if (db.week >= date) return false;
  db.week = date;
  return true;
}

module.exports = {localDate, migratePeriod};
