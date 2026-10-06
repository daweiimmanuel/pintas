import { describe, it, expect } from 'vitest'

// Test the TRANSITIONS map in isolation by re-exporting or re-declaring it
// Since the map is module-private, we test via the exported functions' shape.
// The actual transition function requires Prisma — tested in integration tests.
// Here we test the InvalidTransitionError and valid path logic.

import { InvalidTransitionError, ConcurrentModificationError } from '../../src/modules/settlements/state-machine.js'

describe('InvalidTransitionError', () => {
  it('has correct message format', () => {
    const err = new InvalidTransitionError('DRAFT', 'REDEEMED')
    expect(err.message).toBe('Invalid transition: DRAFT → REDEEMED')
    expect(err.name).toBe('InvalidTransitionError')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('ConcurrentModificationError', () => {
  it('has correct message', () => {
    const err = new ConcurrentModificationError()
    expect(err.message).toContain('Concurrent modification')
    expect(err.name).toBe('ConcurrentModificationError')
    expect(err).toBeInstanceOf(Error)
  })
})
