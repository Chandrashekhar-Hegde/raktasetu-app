import test from 'node:test';
import assert from 'node:assert/strict';
import { hasTestDatabase, loadApp } from './helpers/routeDb.js';

test('runtime role check: raktasetu_rls cannot bypass RLS, the owner can', { skip: !hasTestDatabase }, async () => {
  const { pool } = await loadApp();
  const { runtimeRoleBypassesRls } = await import('../src/db.js');
  try {
    assert.equal(await runtimeRoleBypassesRls(), false);
    const saved = process.env.DB_RUNTIME_ROLE;
    process.env.DB_RUNTIME_ROLE = '';
    try {
      assert.equal(await runtimeRoleBypassesRls(), true, 'owner/superuser connection is detected as bypassing');
    } finally {
      process.env.DB_RUNTIME_ROLE = saved;
    }
  } finally {
    await pool.end();
  }
});
