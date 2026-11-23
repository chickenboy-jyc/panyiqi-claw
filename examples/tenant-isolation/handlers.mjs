/**
 * A deliberately tiny tenant-isolation example.
 *
 * Both handlers take the same arguments; the only difference is whether the
 * query is scoped by the caller's tenant. This is the bug class where a
 * generic "read the code and suggest adding tenant_id" answer is slower than
 * one real two-tenant request.
 */
export const DOCS = [
  { id: 'kb-a', tenant: 'tenant-a', title: 'A 公司的种植牙话术' },
  { id: 'kb-b', tenant: 'tenant-b', title: 'B 公司的正畸话术' },
];

/** Vulnerable version: kb_id is trusted as-is. */
export function naiveGetDoc({ tenant, kbId }) {
  return DOCS.find((d) => d.id === kbId) || null;
}

/** Fixed version: the row must belong to the caller's tenant. */
export function fixedGetDoc({ tenant, kbId }) {
  const doc = DOCS.find((d) => d.id === kbId) || null;
  return doc && doc.tenant === tenant ? doc : null;
}
