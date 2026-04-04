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
    // Lazy-init to avoid top-level import issues
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
        'flux-pro/kontext/max/text-to-image',
        {
          input: {
            prompt,
            aspect_ratio: '1:1',
          },
          withPolling: true,
        }
      )

      // Extract image URL from response
      if (result.status === 'completed') {
        // V2 response format — try multiple known paths
        const url =
          result.images?.[0]?.url ||
          result.result?.url ||
          result.result?.images?.[0]?.url ||
          result.output?.url ||
          result.output?.images?.[0]?.url ||
          null

        if (url) {
          console.log(`[higgs] Image generated: ${url.substring(0, 80)}...`)
          return url
        }

        // If we can't find the URL in known paths, log the response for debugging
        console.warn('[higgs] Completed but URL not found. Response:', JSON.stringify(result).substring(0, 500))
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
