import {expect, test} from '@playwright/test'
import type {Counter} from './counter.visual'

test('mount, click, update without losing state, and unmount', async ({
  mount,
}) => {
  const component = await mount<typeof Counter>('Counter/Default', {
    title: 'First',
  })
  await component.getByRole('button', {name: 'Increment'}).click()
  await expect(component.getByRole('status', {name: 'Count'})).toHaveText('1')
  await component.update({title: 'Updated'})
  await expect(component.getByRole('heading')).toHaveText('Updated')
  await expect(component.getByRole('status', {name: 'Count'})).toHaveText('1')
  await component.unmount()
  await expect(component).toBeEmpty()
  const fresh = await mount('Counter/Default')
  await expect(fresh.getByRole('status', {name: 'Count'})).toHaveText('0')
})

test('unknown stories fail at mount', async ({mount}) => {
  await expect(mount('Missing/Story')).rejects.toThrow(
    'Unknown visual: Missing/Story'
  )
})

test('render failures reject mount and a later mount recovers', async ({
  mount,
}) => {
  await expect(mount('Counter/Broken')).rejects.toThrow('Story render failed')
  const component = await mount('Counter/Default')
  await expect(component.getByRole('status', {name: 'Count'})).toHaveText('0')
})
