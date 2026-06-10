import express from 'express'
import https from 'https'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// Proxy /anthropic/* → https://api.anthropic.com/*
// The API key lives only on the server, never in the client bundle.
app.use('/anthropic', (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' })
  }

  const options = {
    hostname: 'api.anthropic.com',
    path: req.url,
    method: req.method,
    headers: {
      'content-type': 'application/json',
      'content-length': req.headers['content-length'],
      'x-api-key': apiKey,
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
    },
  }

  const proxy = https.request(options, (apiRes) => {
    console.log(`Anthropic API responded: ${apiRes.statusCode}`)
    res.status(apiRes.statusCode)
    apiRes.pipe(res)
  })

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message)
    res.status(502).json({ error: 'Upstream API error', detail: err.message })
  })

  req.pipe(proxy)
})

// Serve the Vite build
app.use(express.static(join(__dirname, 'dist')))

// SPA fallback — let React Router handle unknown paths
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`)
})
