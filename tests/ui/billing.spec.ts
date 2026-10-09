import {test, expect} from '@playwright/test'

test('billing UI fixture', ({baseURL}) => {expect(baseURL).toBe('http://localhost:1234')})
