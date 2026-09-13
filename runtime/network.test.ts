import assert from 'node:assert/strict'
import {test} from 'node:test'
import {remoteAppUrl} from './network.js'

test('remote URL selection preserves paths and permits only explicit destinations', () => {
  const url = remoteAppUrl({
    VRT_BASE_URL_ENV: 'APP_URL',
    APP_URL: 'https://app.example/nested/?locale=fr',
  })!
  assert.equal(url, 'https://app.example/nested/?locale=fr')
  assert.equal(
    remoteAppUrl({VRT_BASE_URL: 'http://localhost:8080/'}),
    'http://localhost:8080/'
  )
  assert.equal(remoteAppUrl({}), undefined)
  assert.equal(
    remoteAppUrl({VRT_BASE_URL: '', VRT_BASE_URL_ENV: ''}),
    undefined
  )
})

test('remote mode fails closed for missing or malformed endpoints', () => {
  for (const env of [
    {VRT_BASE_URL_ENV: 'MISSING'},
    {VRT_BASE_URL: ''},
    {VRT_BASE_URL: '/relative'},
    {VRT_BASE_URL: 'file:///tmp/index.html'},
    {VRT_BASE_URL: 'https://user:secret@app.example'},
    {VRT_BASE_URL: 'https://*.example'},
    {VRT_BASE_URL: 'https://app.example/#fragment'},
    {VRT_BASE_URL: 'https://app.example', VRT_BASE_URL_ENV: 'APP_URL'},
  ])
    assert.throws(() => remoteAppUrl(env))
})
