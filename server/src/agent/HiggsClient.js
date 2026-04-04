class HiggsClient {
  constructor() {
    const keyId = process.env.HIGGSFIELD_KEY_ID
    const keySecret = process.env.HIGGSFIELD_KEY_SECRET

    if (!keyId || !keySecret) {
      console.warn('[higgs] Higgsfield credentials not configured — image generation disabled')
      this.enabled = false
      return
    }

    this.enabled = true
    this._initialized = false
    this._keyId = keyId
    this._keySecret = keySecret
  }

  _init() {
    if (this._initialized) return
    const v2 = require('@higgsfield/client/v2')
    v2.config({ credentials: `${this._keyId}:${this._keySecret}` })
    this.higgsfield = v2.higgsfield
    this._initialized = true
  }

  async generate(prompt) {
    if (!this.enabled) return null

    this._init()
    console.log(`[higgs] Generating image: "${prompt}"`)

    try {
      const result = await this.higgsfield.subscribe(
        'higgsfield-ai/soul/standard',
        {
          input: {
            prompt,
            aspect_ratio: '1:1',
            resolution: '1080p',
          },
          withPolling: true,
        }
      )

      console.log(`[higgs] Status: ${result.status}`)

      if (result.status === 'completed') {
        // Try all known response paths (SDK format + raw API format)
        const url =
          result.images?.[0]?.url ||           // Raw API: { images: [{ url }] }
          result.jobs?.[0]?.results?.raw?.url || // SDK JobSet: { jobs: [{ results: { raw: { url } } }] }
          result.result?.url ||
          result.result?.images?.[0]?.url ||
          null

        if (url) {
          console.log(`[higgs] Image generated: ${url.substring(0, 80)}...`)
          return url
        }

        console.warn('[higgs] Completed but URL not found. Response keys:', Object.keys(result))
        console.warn('[higgs] Full response:', JSON.stringify(result).substring(0, 500))
        return null
      }

      if (result.status === 'nsfw') {
        console.warn('[higgs] Image blocked by NSFW filter')
        return null
      }

      console.warn(`[higgs] Unexpected status: ${result.status}`)
      return null
    } catch (err) {
      console.error('[higgs] Generation error:', err.message)
      throw err
    }
  }
}

module.exports = { HiggsClient }
