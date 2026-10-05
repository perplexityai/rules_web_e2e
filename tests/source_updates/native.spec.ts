import {test, expect} from '@playwright/test'

test('new snapshot replaces its previous bytes', ({}, info) => {
  info.snapshotSuffix = ''
  expect('new').toMatchSnapshot('change.txt')
})
