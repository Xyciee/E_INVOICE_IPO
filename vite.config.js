import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://einvoice.ipolymersolutionscorp.com',
        changeOrigin: true,
        secure: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader('Referer', 'https://einvoice.ipolymersolutionscorp.com/');
            proxyReq.setHeader('Origin', 'https://einvoice.ipolymersolutionscorp.com');
          });
          // Make backend cookies (sessionid, csrftoken) usable on http://localhost
          proxy.on('proxyRes', (proxyRes) => {
            const sc = proxyRes.headers['set-cookie'];
            if (sc) {
              proxyRes.headers['set-cookie'] = sc.map((c) =>
                c
                  .replace(/;\s*Secure/gi, '')
                  .replace(/;\s*Domain=[^;]+/gi, '')
                  .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
              );
            }
          });
        }
      }
    }
  }
})
