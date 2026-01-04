/**
 * Factory for creating test providers
 */

import { TestProvider } from './types'

export type ProviderName = 'mongodb' | 'mondodb'

// Dynamic imports to avoid loading both when only one is needed
export async function createProvider(name: ProviderName): Promise<TestProvider> {
  if (name === 'mongodb') {
    const { MongoDBProvider } = await import('./mongodb-provider')
    const provider = new MongoDBProvider()
    await provider.connect()
    return provider
  } else {
    const { MondoDBProvider } = await import('./mondodb-provider')
    const provider = new MondoDBProvider()
    await provider.connect()
    return provider
  }
}

export async function createBothProviders(): Promise<{
  mongodb: TestProvider
  mondodb: TestProvider
}> {
  const [mongodb, mondodb] = await Promise.all([
    createProvider('mongodb'),
    createProvider('mondodb')
  ])
  return { mongodb, mondodb }
}

// Cleanup helper
export async function cleanupProviders(...providers: TestProvider[]): Promise<void> {
  await Promise.all(providers.map(p => p.disconnect()))
}
