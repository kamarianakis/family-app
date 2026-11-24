import { defineConfig, minimal2023Preset as base } from '@vite-pwa/assets-generator/config'

const bg = '#1e293b' // ίδιο με το φόντο του icon.svg, ώστε να μην υπάρχει λευκό περιθώριο

export default defineConfig({
  preset: {
    ...base,
    transparent: { ...base.transparent, padding: 0 },
    maskable: { ...base.maskable, padding: 0.1, resizeOptions: { background: bg, fit: 'contain' } },
    apple: { ...base.apple, padding: 0, resizeOptions: { background: bg, fit: 'contain' } }
  },
  images: ['public/icon.svg']
})
