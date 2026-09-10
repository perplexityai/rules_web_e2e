import {expect, test} from '@playwright/test'

test('mounted component screenshot after interaction', async ({mount}) => {
  const component = await mount('Counter/Default')
  await component.getByRole('button', {name: 'Increment'}).click()
  await expect(component.getByRole('status', {name: 'Count'})).toHaveText('1')
  await expect(component).toHaveScreenshot('counter.png')
})
