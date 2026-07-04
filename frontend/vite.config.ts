import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'apple-touch-icon-120x120.png',
        'apple-touch-icon-152x152.png',
        'apple-touch-icon-167x167.png',
        'apple-touch-icon-180x180.png',
        'android-chrome-192x192.png',
        'android-chrome-512x512.png',
        'apple-touch-startup-iphone-x.png',
        'apple-touch-startup-iphone-xr.png',
        'apple-touch-startup-iphone-xsmax.png',
        'apple-touch-startup-iphone-12.png',
        'apple-touch-startup-iphone-12-mini.png',
        'apple-touch-startup-iphone-12-max.png',
        'apple-touch-startup-iphone-14-pro.png',
        'apple-touch-startup-iphone-14-promax.png',
        'apple-touch-startup-ipad.png',
        'apple-touch-startup-ipad-pro-11.png',
        'apple-touch-startup-ipad-pro-129.png',
        'browserconfig.xml',
      ],
      manifest: {
        name: 'EchoSub - 语言学习与课文背诵',
        short_name: 'EchoSub',
        description: '自主托管的语言学习与课文背诵 Web 应用',
        theme_color: '#FF7A45',
        background_color: '#FFF9F0',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'zh-CN',
        icons: [
          { src: '/apple-touch-icon-180x180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
          { src: '/apple-touch-icon-167x167.png', sizes: '167x167', type: 'image/png', purpose: 'any' },
          { src: '/apple-touch-icon-152x152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
          { src: '/apple-touch-icon-120x120.png', sizes: '120x120', type: 'image/png', purpose: 'any' },
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // 媒体流不走 SW 缓存（带 token 的 Range 请求需直连后端）
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/media\/\d+\/stream/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'echosub-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
