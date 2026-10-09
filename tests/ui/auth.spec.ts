import {test, expect} from '@playwright/test'

test('auth UI fixture', ({baseURL}) => {expect(baseURL).toBe('http://localhost:1234')})
