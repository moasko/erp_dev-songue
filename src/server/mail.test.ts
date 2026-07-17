import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// mail.ts importe getRequestHeader (utilise seulement par appBaseUrl). On le
// neutralise pour pouvoir charger le module hors du contexte du framework.
vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeader: () => undefined,
}))

import { mailIsConfigured, sendMail } from './mail'

const MESSAGE = { to: 'client@example.com', subject: 'Votre code', text: '123456' }

function mockFetchOnce(response: { ok: boolean; status?: number; body?: string }) {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    text: async () => response.body ?? '',
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  delete process.env.RESEND_API_KEY
  delete process.env.BREVO_API_KEY
  process.env.MAIL_FROM = 'Icomgest <no-reply@icomgest.cloud>'
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sendMail — selection du transport', () => {
  it("sans aucune cle, n'appelle pas fetch et signale delivered:false", async () => {
    const fetchMock = mockFetchOnce({ ok: true })
    expect(mailIsConfigured()).toBe(false)

    const result = await sendMail(MESSAGE)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, delivered: false })
  })

  it('avec BREVO_API_KEY, poste sur l\'API Brevo au bon format', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test'
    const fetchMock = mockFetchOnce({ ok: true })
    expect(mailIsConfigured()).toBe(true)

    const result = await sendMail(MESSAGE)

    expect(result).toEqual({ ok: true, delivered: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect((init.headers as Record<string, string>)['api-key']).toBe('xkeysib-test')
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'Icomgest', email: 'no-reply@icomgest.cloud' },
      to: [{ email: 'client@example.com' }],
      subject: 'Votre code',
      textContent: '123456',
    })
  })

  it('avec RESEND_API_KEY, poste sur l\'API Resend au bon format', async () => {
    process.env.RESEND_API_KEY = 're-test'
    const fetchMock = mockFetchOnce({ ok: true })

    const result = await sendMail(MESSAGE)

    expect(result).toEqual({ ok: true, delivered: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re-test')
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Icomgest <no-reply@icomgest.cloud>',
      to: ['client@example.com'],
      subject: 'Votre code',
      text: '123456',
    })
  })

  it('donne la priorite a Resend quand les deux cles sont presentes', async () => {
    process.env.RESEND_API_KEY = 're-test'
    process.env.BREVO_API_KEY = 'xkeysib-test'
    const fetchMock = mockFetchOnce({ ok: true })

    await sendMail(MESSAGE)

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails')
  })

  it('remonte un echec quand le fournisseur refuse l\'envoi', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test'
    mockFetchOnce({ ok: false, status: 401, body: 'unauthorized' })

    const result = await sendMail(MESSAGE)

    expect(result.ok).toBe(false)
    expect(result.delivered).toBe(false)
  })

  it('remonte un echec en cas d\'erreur reseau', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test'
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const result = await sendMail(MESSAGE)

    expect(result.ok).toBe(false)
    expect(result.delivered).toBe(false)
  })
})
