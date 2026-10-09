import {test, expect} from '@playwright/test'
import {expectedBaseURL} from './expected-base-url.js'

test('auth UI fixture', ({baseURL}) => {expect(baseURL).toBe(expectedBaseURL)})
