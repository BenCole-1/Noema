import https from 'https'

export default function handler(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server.' })
  }

  const body = JSON.stringify(req.body)

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      'x-api-key': apiKey,
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
    },
  }

  const proxy = https.request(options, (apiRes) => {
    res.status(apiRes.statusCode)
    apiRes.pipe(res)
  })

  proxy.on('error', (err) => {
    res.status(502).json({ error: 'Upstream error', detail: err.message })
  })

  proxy.write(body)
  proxy.end()
}
