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
  currency: string
  timestamp: string
  asset: KuberaItem[]
  debt: KuberaItem[]
}

export async function getPortfolioData(credentials: KuberaCredentials, portfolioId: string): Promise<KuberaSnapshot> {
  const envelope = await request<KuberaEnvelope<RawKuberaPortfolioData>>(credentials, 'GET', `/portfolio/${portfolioId}`)
  const data = envelope.data
  return {
    asOfDate: data.timestamp.slice(0, 10),
    baseCurrency: data.currency,
    items: [...data.asset, ...data.debt],
  }
}
