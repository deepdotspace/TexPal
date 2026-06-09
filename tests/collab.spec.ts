import { test, expect } from 'deepspace/testing'

/**
 * Multi-user smoke. Two authenticated users, in isolated browser contexts,
 * each independently reach the signed-in app. Uses the SDK's `users` fixture,
 * which handles sign-in (cached per-account storage state) and cleanup.
 *
 * Requires at least 2 test accounts in the shared pool:
 *   npx deepspace test-accounts create --email a@deepspace.test --password <pw> --name "A"
 *   npx deepspace test-accounts create --email b@deepspace.test --password <pw> --name "B"
 */
test('two users independently reach the signed-in app', async ({ users }) => {
  const [a, b] = await users(2)

  // The fixture handed us two distinct accounts.
  expect(a.userId).not.toBe(b.userId)

  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  // Each isolated session loads the signed-in home shell.
  await expect(a.page.getByTestId('home-page')).toBeVisible({ timeout: 15_000 })
  await expect(b.page.getByTestId('home-page')).toBeVisible({ timeout: 15_000 })
})
