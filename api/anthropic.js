const https = require('https')

module.exports = function handler(req, res) {
  console.log('handler called, method:', req.method)
  console.log('body type:', typeof req.body)
  console.log('body:', JSON.stringify(req.body))

  const apiKey = process.env.ANTHROPIC_API_KEY
  console.log('apiKey present:', !!apiKey)

  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server.' })
  }

  let body
  try {
    body = JSON.stringify(req.body)
  } catch (e) {
    console.error('body stringify error:', e.message)
    return res.status(500).json({ error: 'Failed to serialize request body' })
  }

  console.log('making upstream request, body length:', body.length)

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
    console.log('upstream status:', apiRes.statusCode)
    res.status(apiRes.statusCode)
    apiRes.pipe(res)
  })

  proxy.on('error', (err) => {
    console.error('proxy error:', err.message)
    res.status(502).json({ error: 'Upstream error', detail: err.message })
  })

  proxy.write(body)
  proxy.end()
}
