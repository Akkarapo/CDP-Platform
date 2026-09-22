import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// `vite dev` only serves the client app — it has no idea /api/* exists.
// In production Vercel routes /api/generate-campaign to api/generate-campaign.ts
// itself; this plugin reproduces just enough of that for local dev, loading
// the same handler logic through Vite's own TS transform so there's no
// separate build step and no need for `vercel dev`.
function apiDevMiddleware(geminiApiKey: string | undefined): Plugin {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/generate-campaign', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {}
          const { generateCampaign } = await server.ssrLoadModule('/api/_lib/generateCampaign.ts')
          const result = await generateCampaign(body, geminiApiKey)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }))
        }
      })
    },
  }
}

// Vite config — https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), apiDevMiddleware(env.GEMINI_API_KEY)],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
