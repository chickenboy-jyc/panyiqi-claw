import test from 'node:test';
import assert from 'node:assert/strict';
import { naiveGetDoc, fixedGetDoc } from '../examples/tenant-isolation/handlers.mjs';

test('naive handler leaks another tenant document', () => {
  const d = naiveGetDoc({ tenant: 'tenant-a', kbId: 'kb-b' });
  assert.ok(d);
  assert.equal(d.tenant, 'tenant-b');
});

test('fixed handler scopes the lookup by tenant', () => {
  assert.equal(fixedGetDoc({ tenant: 'tenant-a', kbId: 'kb-b' }), null);
  assert.equal(fixedGetDoc({ tenant: 'tenant-a', kbId: 'kb-a' }).id, 'kb-a');
  assert.equal(fixedGetDoc({ tenant: 'tenant-b', kbId: 'kb-b' }).id, 'kb-b');
});
