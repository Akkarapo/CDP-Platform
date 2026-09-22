import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// `vite dev` only serves the client app — it has no idea /api/* exists.
// In production Vercel routes /api/generate-campaign to api/generate-campaign.ts
// itself; this plugin reproduces just enough of that for local dev, loading
// the same handler logic through Vite's own TS transform so there's no
// separate build step and no need for `vercel dev`.
interface LineDevEnv {
  channelId: string | undefined
  channelSecret: string | undefined
  accessToken: string | undefined
  basicId: string | undefined
}

function apiDevMiddleware(geminiApiKey: string | undefined, lineEnv: LineDevEnv): Plugin {
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

      server.middlewares.use('/api/line-webhook', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const rawBody = Buffer.concat(chunks)
          const { verifyLineSignature, replyMessage } = await server.ssrLoadModule('/api/_lib/lineClient.ts')
          const channelSecret = lineEnv.channelSecret
          const accessToken = lineEnv.accessToken
          if (!channelSecret || !accessToken) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'LINE channel ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์' }))
            return
          }
          const signature = req.headers['x-line-signature']
          if (!verifyLineSignature(rawBody, typeof signature === 'string' ? signature : undefined, channelSecret)) {
            res.statusCode = 401
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Invalid signature' }))
            return
          }
          const body = rawBody.length ? JSON.parse(rawBody.toString('utf-8')) : { events: [] }
          const { recordLineEvent, isLineAdmin } = await server.ssrLoadModule('/api/_lib/lineUsers.ts')
          const { confirmClick, getCampaignReport, formatCampaignReport } = await server.ssrLoadModule('/api/_lib/tracking.ts')
          const TRACKING_CODE_PATTERN = /^[A-Z0-9]{6}$/
          await Promise.all(
            (body.events ?? []).map(async (event: { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string } }) => {
              try {
                await recordLineEvent(event, accessToken)
                if (event.type === 'message' && event.message?.type === 'text' && event.replyToken) {
                  const text = (event.message.text ?? '').trim()
                  const userId = event.source?.userId
                  if (TRACKING_CODE_PATTERN.test(text.toUpperCase())) {
                    const result = userId
                      ? await confirmClick(text.toUpperCase(), userId)
                      : { ok: false, reason: 'not_found', campaignId: null, campaignName: null, confirmedCount: 0 }
                    let replyText
                    if (result.ok) {
                      replyText = 'ยืนยันการใช้โค้ดสำเร็จ ขอบคุณค่ะ 🎉'
                    } else if (result.reason === 'paused') {
                      replyText = `แคมเปญ "${result.campaignName}" หยุดรับการยืนยันชั่วคราวอยู่ กรุณาลองใหม่ภายหลัง`
                    } else if (result.reason === 'cancelled') {
                      replyText = `แคมเปญ "${result.campaignName}" ถูกยกเลิกแล้ว ไม่สามารถใช้โค้ดนี้ได้อีก`
                    } else {
                      replyText = 'ไม่พบรหัสนี้ หรือถูกใช้ไปแล้ว'
                    }
                    await replyMessage(event.replyToken, [{ type: 'text', text: replyText }], accessToken)
                  } else if (text === '/report') {
                    const allowed = userId ? await isLineAdmin(userId) : false
                    if (!allowed) {
                      await replyMessage(event.replyToken, [{ type: 'text', text: 'คำสั่งนี้สำหรับแอดมินเท่านั้น' }], accessToken)
                    } else {
                      const rows = await getCampaignReport(5)
                      await replyMessage(event.replyToken, [{ type: 'text', text: formatCampaignReport(rows) }], accessToken)
                    }
                  } else {
                    await replyMessage(event.replyToken, [{ type: 'text', text: 'ขอบคุณที่ติดต่อเรา ทีมงานได้รับข้อความแล้ว' }], accessToken)
                  }
                }
              } catch (err) {
                console.error('line-webhook event handling failed', err)
              }
            })
          )
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }))
        }
      })

      server.middlewares.use('/api/line-status', async (req, res) => {
        const { addFriendUrl } = await server.ssrLoadModule('/api/_lib/lineClient.ts')
        const basicId = lineEnv.basicId ?? null
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({
          connected: Boolean(lineEnv.channelSecret && lineEnv.accessToken),
          channelId: lineEnv.channelId ?? null,
          basicId,
          addFriendUrl: basicId ? addFriendUrl(basicId) : null,
        }))
      })

      server.middlewares.use('/api/line-send', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        try {
          const { requireWorkspaceRole } = await server.ssrLoadModule('/api/_lib/auth.ts')
          const auth = await requireWorkspaceRole(req, ['admin', 'editor'])
          if (!auth.ok) {
            res.statusCode = auth.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: auth.error }))
            return
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {}
          const accessToken = lineEnv.accessToken
          if (!accessToken) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์' }))
            return
          }
          if (!body.to?.trim() || !body.text?.trim()) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'กรุณาระบุ LINE User ID และข้อความ' }))
            return
          }
          const { pushMessage } = await server.ssrLoadModule('/api/_lib/lineClient.ts')
          await pushMessage(body.to.trim(), [{ type: 'text', text: body.text.trim() }], accessToken)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (err) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'ส่งข้อความไม่สำเร็จ' }))
        }
      })

      server.middlewares.use('/api/line-sync-followers', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        try {
          const { requireWorkspaceRole } = await server.ssrLoadModule('/api/_lib/auth.ts')
          const auth = await requireWorkspaceRole(req, ['admin', 'editor'])
          if (!auth.ok) {
            res.statusCode = auth.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: auth.error }))
            return
          }
          const accessToken = lineEnv.accessToken
          if (!accessToken) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์' }))
            return
          }
          const { syncFollowers } = await server.ssrLoadModule('/api/_lib/lineUsers.ts')
          const synced = await syncFollowers(accessToken)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, synced }))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'ซิงค์ผู้ติดตามไม่สำเร็จ' }))
        }
      })

      server.middlewares.use('/api/track', async (req, res) => {
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const campaignId = url.searchParams.get('c')
          const { recordClick } = await server.ssrLoadModule('/api/_lib/tracking.ts')
          const { oaMessageUrl } = await server.ssrLoadModule('/api/_lib/lineClient.ts')
          const code = await recordClick(campaignId)
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          if (!code) {
            res.statusCode = 500
            res.end('<p>เกิดข้อผิดพลาด ลองใหม่อีกครั้ง</p>')
            return
          }
          const basicId = lineEnv.basicId
          const cta = basicId
            ? `<a href="${oaMessageUrl(basicId, code)}" style="display:inline-block;margin-top:20px;background:#06C755;color:#fff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:999px">กลับไปวางรหัสใน LINE</a>`
            : ''
          res.end(`<!doctype html><html lang="th"><head><meta charset="utf-8"></head><body style="font-family:sans-serif;background:#F7F5F2;margin:0;padding:48px 20px;text-align:center;color:#1A1917">
            <p style="font-size:14px;color:#6B6862">คัดลอกรหัสนี้แล้วส่งกลับไปในแชท LINE OA เพื่อยืนยัน</p>
            <div style="font-size:40px;font-weight:700;letter-spacing:8px;background:#fff;border:1px solid #E5E1DA;border-radius:16px;padding:24px;margin:16px auto;max-width:320px">${code}</div>
            ${cta}
          </body></html>`)
        } catch (err) {
          res.statusCode = 500
          res.end(err instanceof Error ? err.message : 'Unexpected error')
        }
      })

      server.middlewares.use('/api/campaign-send', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        try {
          const { requireWorkspaceRole } = await server.ssrLoadModule('/api/_lib/auth.ts')
          const auth = await requireWorkspaceRole(req, ['admin', 'editor'])
          if (!auth.ok) {
            res.statusCode = auth.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: auth.error }))
            return
          }
          const accessToken = lineEnv.accessToken
          if (!accessToken) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์' }))
            return
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {}
          if (!body.campaignId) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'กรุณาระบุ campaignId' }))
            return
          }
          const { sendCampaignToLine } = await server.ssrLoadModule('/api/_lib/campaignSend.ts')
          const recipientCount = await sendCampaignToLine(body.campaignId, accessToken)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, recipientCount }))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'ส่งแคมเปญไม่สำเร็จ' }))
        }
      })
    },
  }
}

// Vite config — https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // api/_lib/supabaseAdmin.ts reads these straight from process.env (same
  // shape as production); loadEnv() alone doesn't populate process.env.
  process.env.VITE_SUPABASE_URL ??= env.VITE_SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= env.SUPABASE_SERVICE_ROLE_KEY
  return {
    plugins: [react(), tailwindcss(), apiDevMiddleware(env.GEMINI_API_KEY, {
      channelId: env.LINE_CHANNEL_ID,
      channelSecret: env.LINE_CHANNEL_SECRET,
      accessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
      basicId: env.LINE_OA_BASIC_ID,
    })],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
