import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIVERS } from '../src/utils/bloodCompatibility.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GROUPS = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

/**
 * Independent derivation of red-cell compatibility: a donor can give if every ABO antigen
 * on their cells is also on the recipient's, and they are Rh- or the recipient is Rh+.
 * Comparing against this (not just copy-vs-copy) catches an edit that changes every copy at once.
 */
function canGive(donor, recipient) {
  const antigens = (g) => new Set(g.replace(/[+-]/, '').replace('O', '').split(''));
  const aboOk = [...antigens(donor)].every((a) => antigens(recipient).has(a));
  const rhOk = donor.endsWith('-') || recipient.endsWith('+');
  return aboOk && rhOk;
}

/** Extract `export const GIVERS = { ... };` from theme.js without importing the frontend bundle. */
function themeGivers() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/theme.js'), 'utf8');
  const match = source.match(/export const GIVERS = (\{[\s\S]*?\});/);
  assert.ok(match, 'frontend/src/theme.js must export const GIVERS = { ... }');
  return Function(`"use strict"; return (${match[1]});`)();
}

test('GIVERS matches the ABO/Rh rule for every donor/recipient pair', () => {
  for (const recipient of GROUPS) {
    const expected = GROUPS.filter((donor) => canGive(donor, recipient));
    assert.deepEqual([...GIVERS[recipient]].sort(), expected.sort(), `givers for ${recipient}`);
  }
  assert.deepEqual(GIVERS['AB+'].length, 8, 'AB+ is the universal recipient');
  assert.ok(GROUPS.every((g) => GIVERS[g].includes('O-')), 'O- is the universal donor');
});

test('frontend display copy of GIVERS matches the backend source of truth', () => {
  assert.deepEqual(themeGivers(), { ...GIVERS });
});
