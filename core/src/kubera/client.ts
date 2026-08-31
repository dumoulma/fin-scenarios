import { createHmac } from 'node:crypto'
import type { KuberaItem, KuberaSnapshot } from './types.ts'

const BASE_URL = 'https://api.kubera.com'
const PATH_PREFIX = '/api/v3/data'

export type KuberaCredentials = { apiKey: string; apiSecret: string }

function sign(credentials: KuberaCredentials, timestamp: string, method: string, path: string, bodyString: string): string {
  const signingString = `${credentials.apiKey}${timestamp}${method}${path}${bodyString}`
  return createHmac('sha256', credentials.apiSecret).update(signingString).digest('hex')
}

async function request<T>(credentials: KuberaCredentials, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const bodyString = body === undefined ? '' : JSON.stringify(body)
  const fullPath = `${PATH_PREFIX}${path}`

  const response = await fetch(`${BASE_URL}${fullPath}`, {
    method,
    headers: {
      'x-api-token': credentials.apiKey,
      'x-timestamp': timestamp,
      'x-signature': sign(credentials, timestamp, method, fullPath, bodyString),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: bodyString === '' ? undefined : bodyString,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Kubera API ${method} ${fullPath} failed: ${response.status} ${response.statusText} — ${text}`)
  }

  return (await response.json()) as T
}

type KuberaEnvelope<T> = { data: T; errorCode: number; errorMessage?: string }

export type KuberaPortfolioSummary = { id: string; name: string; currency: string }

export async function listPortfolios(credentials: KuberaCredentials): Promise<KuberaPortfolioSummary[]> {
  const envelope = await request<KuberaEnvelope<KuberaPortfolioSummary[]>>(credentials, 'GET', '/portfolio')
  return envelope.data
}

type RawKuberaPortfolioData = {
  timestamp: string
  asset: KuberaItem[]
  debt: KuberaItem[]
}

// The portfolio-detail endpoint doesn't reliably return its own top-level
// currency field (confirmed against the live API: it comes back undefined,
// even though every item's own value.currency is present) — the list endpoint
// (listPortfolios) is the reliable source for a portfolio's base currency, so
// the caller must supply it rather than this function guessing from a field
// that may not be there.
export async function getPortfolioData(credentials: KuberaCredentials, portfolioId: string, baseCurrency: string): Promise<KuberaSnapshot> {
  const envelope = await request<KuberaEnvelope<RawKuberaPortfolioData>>(credentials, 'GET', `/portfolio/${portfolioId}`)
  const data = envelope.data
  return {
    asOfDate: data.timestamp.slice(0, 10),
    baseCurrency,
    items: [...data.asset, ...data.debt],
  }
}
