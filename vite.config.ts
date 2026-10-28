// 开发与组件测试配置：React 转换、同源 API/身份代理及 jsdom 环境在这里组合；浏览器端测试单独运行。
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 开发浏览器沿同源前缀访问后端，目标端口只用于本机开发代理。
  server: {
    proxy: {
      '/api': 'http://localhost:8081',
      '/auth': 'http://localhost:8082',
    },
  },
  // 组件测试使用 DOM 模拟；e2e 由独立 Playwright 配置负责。
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
