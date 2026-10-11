import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({ ...base, testMatch: '**/live-read.spec.ts', testIgnore: [], timeout: 120_000 })
