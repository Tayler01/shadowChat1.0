import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterXTimelineCandidates,
  selectSnapshotsToStore,
} from '../services/news-scraper/src/index.mjs'

test('keeps non-pinned X timeline candidates', () => {
  const result = filterXTimelineCandidates([
    {
      externalId: '10',
      sourceUrl: 'https://x.com/example/status/10',
      isPinned: true,
    },
    {
      externalId: '11',
      sourceUrl: 'https://x.com/example/status/11',
      isPinned: false,
    },
  ], 'example')

  assert.equal(result.length, 1)
  assert.equal(result[0].externalId, '11')
})

test('rejects pinned-only X timelines as stale', () => {
  assert.throws(() => {
    filterXTimelineCandidates([
      {
        externalId: '10',
        sourceUrl: 'https://x.com/example/status/10',
        isPinned: true,
      },
    ], 'example')
  }, /Only pinned X posts could be extracted for @example/)
})

test('does not regress source cursor when provider returns stale snapshots', () => {
  const result = selectSnapshotsToStore(
    { last_seen_external_id: '200' },
    [
      {
        platform: 'x',
        externalId: '150',
        sourceUrl: 'https://x.com/example/status/150',
      },
    ]
  )

  assert.equal(result.latest.externalId, '150')
  assert.equal(result.cursorSnapshot, null)
  assert.equal(result.staleCursor, true)
  assert.deepEqual(result.toStore, [])
})

test('treats matching source cursor as seen, not stale', () => {
  const result = selectSnapshotsToStore(
    { last_seen_external_id: '200' },
    [
      {
        platform: 'x',
        externalId: '200',
        sourceUrl: 'https://x.com/example/status/200',
      },
    ]
  )

  assert.equal(result.cursorSnapshot.externalId, '200')
  assert.equal(result.staleCursor, false)
  assert.deepEqual(result.toStore, [])
})

test('advances source cursor only with newer snapshots', () => {
  const result = selectSnapshotsToStore(
    { last_seen_external_id: '200' },
    [
      {
        platform: 'x',
        externalId: '150',
        sourceUrl: 'https://x.com/example/status/150',
      },
      {
        platform: 'x',
        externalId: '250',
        sourceUrl: 'https://x.com/example/status/250',
      },
    ]
  )

  assert.equal(result.cursorSnapshot.externalId, '250')
  assert.equal(result.staleCursor, false)
  assert.equal(result.toStore.length, 1)
  assert.equal(result.toStore[0].externalId, '250')
})
