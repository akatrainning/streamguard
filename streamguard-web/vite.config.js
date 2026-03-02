import crypto from 'node:crypto'

// Vite 7 requires global crypto.getRandomValues which is missing in Node 16
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: crypto.webcrypto,
    writable: true,
    configurable: true
  });
}

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
