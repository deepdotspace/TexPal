import { test, expect } from '@playwright/test'

test.describe('API tests', () => {
  test('auth proxy forwards to the auth worker', async ({ request }) => {
    const res = await request.get('/api/auth/ok')
    expect(res.ok()).toBeTruthy()
  })
})
