import { describe, it, expect } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'

describe('Debug aggregate this binding', () => {
  it('verifies this binding in aggregate method', async () => {
    const id = env.MONDO_DATABASE.idFromName('this-debug-' + Math.random())
    const stub = env.MONDO_DATABASE.get(id)

    // Reset and insert
    await stub.fetch('http://test/internal/reset', { method: 'POST' })
    await stub.fetch('http://test/insertOne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: 'products',
        document: { name: 'Widget', price: 100 }
      })
    })

    const result = await runInDurableObject(stub, async (instance: any, state: any) => {
      console.log('Checking instance properties...')
      console.log('instance.state:', typeof instance.state)
      console.log('instance.state.storage:', typeof instance.state?.storage)
      console.log('instance.state.storage.sql:', typeof instance.state?.storage?.sql)
      console.log('instance.env:', instance.env)
      console.log('instance.getCollectionId:', typeof instance.getCollectionId)

      // Try calling getCollectionId directly
      const collId = instance.getCollectionId.call(instance, 'products')
      console.log('getCollectionId("products"):', collId)

      // Now let's try calling aggregate with bound this
      console.log('Calling aggregate...')
      const aggregateMethod = instance.aggregate.bind(instance)
      const result = await aggregateMethod('products', [{ $match: {} }])
      console.log('aggregate result:', result)

      return result
    })

    console.log('Final:', result)
  })
})
