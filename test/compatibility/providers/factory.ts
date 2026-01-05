/**
 * Factory for creating test providers
 */

import { TestProvider } from './types'

export type ProviderName = 'mongodb' | 'mongo.do'

// Dynamic imports to avoid loading both when only one is needed
export async function createProvider(name: ProviderName): Promise<TestProvider> {
  if (name === 'mongodb') {
    const { MongoDBProvider } = await import('./mongodb-provider')
    const provider = new MongoDBProvider()
    await provider.connect()
    return provider
  } else {
    const { MondoDBProvider } = await import('./mongo.do-provider')
    const provider = new MondoDBProvider()
    await provider.connect()
    return provider
  }
}

export async function createBothProviders(): Promise<{
  mongodb: TestProvider
  mongo.do: TestProvider
}> {
  const [mongodb, mongo.do] = await Promise.all([
    createProvider('mongodb'),
    createProvider('mongo.do')
  ])
  return { mongodb, mongo.do }
}

// Cleanup helper
export async function cleanupProviders(...providers: TestProvider[]): Promise<void> {
  await Promise.all(providers.map(p => p.disconnect()))
}
