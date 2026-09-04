import { describe, expect, it } from 'vitest'
import app from '../../worker.js'
import type { Env } from '../../worker.js'

describe('/api/integrations/:name/:endpoint proxy', () => {
  it('replaces caller identity with the app identity from server bindings', async () => {
    const forwarded: Request[] = []
    const env = {
      API_WORKER: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const nodeCompatibleInit = init?.body
            ? ({ ...init, duplex: 'half' } as RequestInit & { duplex: 'half' })
            : init
          const request = new Request(input, nodeCompatibleInit)
          forwarded.push(request)
          return Response.json({ success: true })
        },
      },
      APP_IDENTITY_TOKEN: 'server-identity-token',
      DEEPSPACE_APP_ID: 'app_server',
      APP_OWNER_JWT: 'owner-jwt',
    } as unknown as Env

    const response = await app.fetch(
      new Request('https://texpal.app.space/api/integrations/test/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-id': 'app_spoofed',
          'x-app-identity-token': 'spoofed-token',
          'x-user-id': 'user_spoofed',
        },
        body: JSON.stringify({ input: 'test' }),
      }),
      env,
    )

    expect(response.status).toBe(200)
    expect(forwarded).toHaveLength(1)
    expect(forwarded[0].headers.get('x-app-id')).toBe('app_server')
    expect(forwarded[0].headers.get('x-app-identity-token')).toBe('server-identity-token')
    expect(forwarded[0].headers.has('x-user-id')).toBe(false)
    await expect(forwarded[0].json()).resolves.toEqual({ input: 'test' })
  })
})
