import { test, expect } from 'deepspace/testing'

/**
 * Records round-trip — the SDK-upgrade tripwire.
 *
 * WHY THIS EXISTS: the rest of this suite passes green against a completely
 * data-blind app. `smoke.spec.ts` only loads the signed-out landing page, and
 * `collab.spec.ts` asserts that `home-page` renders — which is exactly what the
 * EMPTY STATE renders. Nothing else creates a record and reads it back.
 *
 * The failure this guards against (SDK v0.19.0, migration
 * `2026-08-secure-room-boundaries`): room identity moved from the DO URL's
 * query string into request headers. A worker still forwarding
 * `?userId=` gets no error — the room mints `anon-<uuid>`, RBAC scopes every
 * read to that anonymous id, and every query returns `[]` inside a SUCCESS
 * frame. Every collection in this app is `read: 'own'` or `read: false` for
 * non-admins, so the whole UI goes blank with nothing logged anywhere.
 *
 * Writes are loud in that failure (`CREATE DENIED`), reads are silent. So this
 * test deliberately asserts on the READ side, after a full page reload, to
 * force the record back through the WebSocket subscription path rather than
 * reading it out of the in-memory optimistic cache.
 *
 * If this test fails after an SDK upgrade, check the WS proxy in `worker.ts`
 * before anything else. See `test/SDK_MIGRATION_0.9_to_0.23.md` §1.
 */
test('a signed-in user can create a document and still see it after reload', async ({ users }) => {
  const [a] = await users(1)
  const page = a.page

  await page.goto('/home')
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 15_000 })

  // Create one document from the Blank Article starter. The picker auto-selects
  // a tab based on whether documents exist, so click Templates explicitly
  // rather than relying on which tab happened to open.
  await page.getByRole('button', { name: /templates/i }).first().click()
  await page.getByRole('button', { name: /Blank Article/ }).first().click()

  // Creation navigates into the editor once the write is confirmed.
  await page.waitForURL(/\/editor\//, { timeout: 20_000 })

  // Full reload back to the hub. This is the load-bearing step: it drops the
  // optimistic cache, so the list below can only be populated by records that
  // came back over the room subscription under this user's identity.
  await page.goto('/home')
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /My Documents/i }).first().click()

  // The three assertions that distinguish "working" from "silently anonymous".
  // A data-blind app reaches this point rendering "My Documents (0)" and the
  // "No documents yet" empty state, with no error anywhere.
  await expect(page.locator('.recent-doc-row').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('No documents yet')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /My Documents \(0\)/i })).toHaveCount(0)
})
