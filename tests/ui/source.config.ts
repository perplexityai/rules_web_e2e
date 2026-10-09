import {defineConfig} from '@playwright/test'

export default defineConfig({testMatch: ['auth.spec.ts', 'billing.spec.ts'], use: {baseURL: 'http://localhost:1234'}})
