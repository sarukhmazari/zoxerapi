# Zoxer Media API

[![Runtime](https://img.shields.io/badge/Runtime-Cloudflare%20Workers-orange.svg)](https://workers.cloudflare.com/)
[![Framework](https://img.shields.io/badge/Framework-Hono%20v4-E36002.svg)](https://hono.dev/)
[![Language](https://img.shields.io/badge/Language-TypeScript%205-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-Vitest%20(47%20passed)-green.svg)](https://vitest.dev/)
[![Security](https://img.shields.io/badge/Security-SSRF%20Protected%20%7C%20Timing--Safe-brightgreen.svg)]()

A lightweight, secure, high-performance private media API built for **Cloudflare Workers** using the **Hono** framework and **TypeScript**. 

Designed to be consumed exclusively by a private WhatsApp bot running on AWS Lightsail (Node.js + Baileys). It provides a standardized REST interface for detecting supported platforms, retrieving legitimate metadata, and delivering authorized media references across **TikTok**, **Instagram**, and **YouTube**.

---

## Table of Contents

1. [Architectural Overview](#architectural-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Security & Protection Mechanisms](#security--protection-mechanisms)
5. [Installation & Local Development](#installation--local-development)
6. [Environment Configuration & Secrets](#environment-configuration--secrets)
7. [API Endpoints & Documentation](#api-endpoints--documentation)
   - [Root / Discovery (`GET /`)](#1-root--discovery-get-)
   - [Health Check (`GET /health`)](#2-health-check-get-health)
   - [Platform Detection (`POST /api/v1/detect`)](#3-platform-detection-post-apiv1detect)
   - [Metadata Extraction (`POST /api/v1/metadata`)](#4-metadata-extraction-post-apiv1metadata)
   - [Media Download Reference (`POST /api/v1/download`)](#5-media-download-reference-post-apiv1download)
   - [Job Status (`GET /api/v1/status/:jobId`)](#6-job-status-get-apiv1statusjobid)
8. [Standard Response Schema](#standard-response-schema)
9. [Platform Capabilities & Current Limitations](#platform-capabilities--current-limitations)
10. [WhatsApp Bot Integration (AWS Lightsail)](#whatsapp-bot-integration-aws-lightsail)
11. [Cloudflare Workers Deployment](#cloudflare-workers-deployment)
12. [Testing](#testing)
13. [Troubleshooting](#troubleshooting)

---

## Architectural Overview

```
                                  +------------------------------------+
                                  |   WhatsApp Bot on AWS Lightsail    |
                                  |        (Node.js + Baileys)         |
                                  +-----------------+------------------+
                                                    |
                                       Bearer Token | HTTPS REST
                                                    v
+---------------------------------------------------------------------------------------------------+
| Cloudflare Workers - Zoxer Media API (Edge V8 Isolates)                                          |
|                                                                                                   |
|  [Security & Rate Limit Layer]                                                                    |
|  ├── Payload Size Limiter (<= 1MB)                                                                |
|  ├── In-Memory Sliding-Window Rate Limiter                                                        |
|  ├── Constant-Time Bearer Token Verification (`timingSafeEqual`)                                  |
|  └── SSRF & URL Guard (Disallow RFC1918, Link-Local, AWS/Cloud Metadata 169.254, Obfuscated IPs)  |
|                                                                                                   |
|  [Hono Routing Engine]                                                                            |
|  ├── GET  / & GET /health                                                                         |
|  ├── POST /api/v1/detect                                                                          |
|  ├── POST /api/v1/metadata                                                                        |
|  └── POST /api/v1/download                                                                        |
|                                                                                                   |
|  [Platform Adapter Registry]                                                                      |
|  ├── TikTokAdapter    (Official oEmbed & Author/Thumbnail Resolution)                             |
|  ├── InstagramAdapter (Graph API oEmbed / Shortcode Extraction)                                   |
|  └── YouTubeAdapter   (Official oEmbed API & optional Data API v3)                                |
|                                                                                                   |
|  [Optional Cloudflare Storage Services]                                                           |
|  └── R2 Object Storage (`MEDIA_BUCKET`) / Cloudflare Queues (`MEDIA_QUEUE`)                       |
+---------------------------------------------------------------------------------------------------+
```

---

## Technology Stack

- **Runtime:** [Cloudflare Workers](https://workers.cloudflare.com/) (Edge V8 Serverless)
- **Framework:** [Hono v4](https://hono.dev/)
- **Language:** TypeScript 5 (Strict mode)
- **Validation:** [Zod](https://zod.dev/)
- **Deployment & Dev:** [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- **Testing:** [Vitest](https://vitest.dev/) (Unit, Integration, Security, and Route testing)

No heavy external dependencies, databases (MongoDB/PostgreSQL/Redis), or VPS dependencies are required. The core API is completely stateless.

---

## Project Structure

```
zoxer-media-api/
├── src/
│   ├── index.ts                     # Cloudflare Worker fetch entry point
│   ├── app.ts                       # Hono application setup and middleware pipeline
│   ├── config/
│   │   └── env.ts                   # Environment variable parsing and defaults
│   ├── middleware/
│   │   ├── authentication.ts        # Constant-time Bearer token verification
│   │   ├── error-handler.ts         # Sanitized global error handling (Zod, 404, 500)
│   │   └── rate-limit.ts            # Sliding-window rate limiter per client IP
│   ├── routes/
│   │   ├── health.ts                # GET / and GET /health
│   │   ├── detect.ts                # POST /api/v1/detect
│   │   ├── metadata.ts              # POST /api/v1/metadata
│   │   └── download.ts              # POST /api/v1/download & GET /api/v1/status/:jobId
│   ├── platforms/
│   │   ├── platform.interface.ts    # Standard PlatformAdapter interface
│   │   ├── platform-detector.ts     # Platform detection and adapter registry
│   │   ├── tiktok.ts                # TikTok adapter (oEmbed & canonical resolution)
│   │   ├── instagram.ts             # Instagram adapter (Graph API oEmbed)
│   │   └── youtube.ts               # YouTube adapter (oEmbed & Data API v3)
│   ├── services/
│   │   ├── metadata.service.ts      # Metadata orchestration & security checks
│   │   ├── media.service.ts         # Media processing and capability limits
│   │   └── storage.service.ts       # Optional Cloudflare R2 bucket integration
│   ├── schemas/
│   │   └── request.schema.ts        # Zod request payload validation schemas
│   ├── utils/
│   │   ├── response.ts              # Standard JSON response helpers and error codes
│   │   ├── url-validator.ts         # SSRF filter, IP parser, and URL sanitization
│   │   └── logger.ts                # Token and secret masking logger
│   └── types/
│       └── index.ts                 # Core TypeScript interfaces & types
├── tests/
│   ├── authentication.test.ts       # Auth, constant-time compare, and health tests
│   ├── detection.test.ts            # Platform detection and URL patterns tests
│   ├── metadata.test.ts             # Provider mocking, timeouts, and download tests
│   └── security.test.ts             # SSRF attacks, IP obfuscation, and payload tests
├── examples/
│   └── whatsapp-bot-client.js       # Production-ready Baileys client integration
├── .dev.vars.example                # Local development variables template
├── .gitignore                       # Git ignore preventing secret/build leakage
├── package.json                     # Project manifest and scripts
├── tsconfig.json                    # TypeScript compiler configuration
├── vitest.config.ts                 # Vitest test runner configuration
├── wrangler.toml                    # Cloudflare Workers configuration
└── README.md                        # Documentation
```

---

## Security & Protection Mechanisms

1. **Private Bearer Authentication:**
   Protected routes (`/api/*`) require an `Authorization: Bearer <API_SECRET_KEY>` header.
2. **Constant-Time Comparison:**
   Tokens are validated using a non-short-circuiting bitwise XOR loop (`timingSafeEqual`) to prevent timing side-channel attacks.
3. **SSRF Guard (`validateSafeUrl`):**
   - Disallows non-HTTP/HTTPS schemes (`file:`, `ftp:`, `gopher:`, `javascript:`, etc.).
   - Blocks private IP ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
   - Blocks loopback and link-local addresses: `127.0.0.0/8`, `::1`, `169.254.0.0/16` (AWS & Cloudflare metadata services).
   - Detects and prevents obfuscated decimal or hexadecimal IP notations (e.g. `http://2130706433/`).
4. **Rate Limiting:**
   In-memory sliding-window limiter with configurable thresholds (default: 60 requests per 60 seconds) with standard `Retry-After` and `X-RateLimit-*` headers.
5. **Payload Size Restrictions:**
   Rejects requests with bodies exceeding `MAX_BODY_SIZE_BYTES` (default: 1MB) with `413 Payload Too Large`.
6. **Zero-Secret Logging:**
   `SafeLogger` automatically masks Bearer tokens, URL credentials, and secret strings from console outputs.

---

## Installation & Local Development

### Prerequisites

- Node.js `v20+` or `v22+`
- npm `v10+`

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-username/zoxer-media-api.git
cd zoxer-media-api
npm install
```

### 2. Configure Local Secrets

Create a `.dev.vars` file from the provided example:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:
```ini
API_SECRET_KEY=your_local_secret_key_for_testing
ENVIRONMENT=development
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_WINDOW_SECONDS=60
REQUEST_TIMEOUT_MS=10000
```

### 3. Start Local Development Server

```bash
npm run dev
```

Wrangler will launch the local worker at `http://localhost:8787`.

---

## Environment Configuration & Secrets

| Variable | Type | Source | Required | Description |
| :--- | :--- | :--- | :--- | :--- |
| `API_SECRET_KEY` | Secret | Cloudflare Secret / `.dev.vars` | **Yes** | Master Bearer token for client authentication |
| `ENVIRONMENT` | Var | `wrangler.toml` / `.dev.vars` | No | `development`, `staging`, or `production` |
| `RATE_LIMIT_MAX_REQUESTS` | Var | `wrangler.toml` | No | Max requests allowed in the sliding window (default `60`) |
| `RATE_LIMIT_WINDOW_SECONDS`| Var | `wrangler.toml` | No | Sliding window duration in seconds (default `60`) |
| `MAX_URL_LENGTH` | Var | `wrangler.toml` | No | Maximum URL character length (default `2048`) |
| `MAX_BODY_SIZE_BYTES` | Var | `wrangler.toml` | No | Max JSON payload size in bytes (default `1048576` / 1MB) |
| `REQUEST_TIMEOUT_MS` | Var | `wrangler.toml` | No | Timeout for external provider requests in ms (default `10000`) |
| `YOUTUBE_API_KEY` | Secret | Cloudflare Secret (optional) | No | Optional YouTube Data API v3 key for rich details |
| `INSTAGRAM_ACCESS_TOKEN` | Secret | Cloudflare Secret (optional) | No | Optional Meta Graph API token for Instagram oEmbed |

---

## API Endpoints & Documentation

All protected endpoints require the header:
```http
Authorization: Bearer <API_SECRET_KEY>
Content-Type: application/json
```

---

### 1. Root / Discovery (`GET /`)
Public endpoint providing API metadata and documentation summary.

**Response (`200 OK`):**
```json
{
  "success": true,
  "platform": null,
  "data": {
    "name": "Zoxer Media API",
    "version": "1.0.0",
    "status": "operational",
    "environment": "production",
    "supported_platforms": ["tiktok", "instagram", "youtube"],
    "documentation": { ... }
  },
  "error": null
}
```

---

### 2. Health Check (`GET /health`)
Public runtime health check.

**Response (`200 OK`):**
```json
{
  "success": true,
  "platform": null,
  "data": {
    "status": "healthy",
    "runtime": "Cloudflare Workers (V8 Isolate)",
    "timestamp": "2026-10-30T22:20:00.000Z",
    "uptime_seconds": 128,
    "features": {
      "r2_storage": false,
      "queues": false,
      "youtube_api": false,
      "instagram_api": false
    }
  },
  "error": null
}
```

---

### 3. Platform Detection (`POST /api/v1/detect`)
Detects the target platform, extracts the canonical media ID, and validates URL safety.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "platform": "youtube",
  "data": {
    "detected_platform": "youtube",
    "is_valid": true,
    "is_supported": true,
    "normalized_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "canonical_id": "dQw4w9WgXcQ",
    "media_type_hint": "video"
  },
  "error": null
}
```

---

### 4. Metadata Extraction (`POST /api/v1/metadata`)
Extracts legitimate public metadata (title, author, thumbnail, duration, capabilities) from the media URL.

**Request:**
```json
{
  "url": "https://www.tiktok.com/@creator/video/7123456789012345678"
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "platform": "tiktok",
  "data": {
    "id": "7123456789012345678",
    "title": "Amazing dance tutorial",
    "description": "Amazing dance tutorial",
    "thumbnail": "https://p16-sign-va.tiktokcdn.com/...",
    "author": {
      "name": "Jane Doe",
      "username": "janedoe",
      "url": "https://www.tiktok.com/@janedoe"
    },
    "duration": null,
    "media": {
      "type": "video",
      "format": "mp4",
      "quality": "restricted_by_terms",
      "download_url": null,
      "requires_external_downloader": true
    },
    "available_media": [ ... ],
    "canonical_url": "https://www.tiktok.com/@janedoe/video/7123456789012345678",
    "capabilities": {
      "metadata": true,
      "direct_download": false,
      "requires_official_token": false,
      "terms_restriction_note": "Official TikTok metadata is supported via TikTok oEmbed API."
    }
  },
  "error": null
}
```

---

### 5. Media Download Reference (`POST /api/v1/download`)
Requests an authorized downloadable media reference.

**Request:**
```json
{
  "url": "https://www.tiktok.com/@creator/video/7123456789012345678",
  "format": "image",
  "quality": "best"
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "platform": "tiktok",
  "data": {
    "title": "Amazing dance tutorial",
    "thumbnail": "https://p16-sign-va.tiktokcdn.com/...",
    "author": {
      "name": "Jane Doe",
      "username": "janedoe",
      "url": "https://www.tiktok.com/@janedoe"
    },
    "duration": null,
    "media": {
      "type": "image",
      "format": "jpeg",
      "quality": "best",
      "download_url": "https://p16-sign-va.tiktokcdn.com/...",
      "requires_external_downloader": false
    }
  },
  "error": null
}
```

*Note on direct video extraction:* When a platform's terms of service or access controls forbid automated binary downloading (e.g. YouTube video or TikTok encrypted streams), the API returns a structured `403 Forbidden` error with code `CAPABILITY_UNSUPPORTED` rather than returning broken URLs or fake data.

---

### 6. Job Status (`GET /api/v1/status/:jobId`)
Retrieves the status of asynchronous queue processing if enabled.

**Response (`200 OK`):**
```json
{
  "success": true,
  "platform": null,
  "data": {
    "job_id": "job-12345",
    "status": "completed",
    "processed_at": "2026-10-30T22:20:00.000Z",
    "message": "Initial API operates in synchronous mode."
  },
  "error": null
}
```

---

## Standard Response Schema

Every response from Zoxer Media API strictly adheres to this consistent schema:

### Success Format
```json
{
  "success": true,
  "platform": "tiktok",
  "data": { ... },
  "error": null
}
```

### Error Format
```json
{
  "success": false,
  "platform": null,
  "data": null,
  "error": {
    "code": "UNSUPPORTED_URL",
    "message": "This URL is not supported."
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
| :--- | :--- | :--- |
| `UNAUTHORIZED` | `401` | Missing or invalid Bearer token |
| `INVALID_REQUEST` | `400` | Malformed JSON or schema validation failure |
| `INVALID_URL` | `400` | URL syntax error or disallowed protocol |
| `SSRF_ATTEMPT_DETECTED` | `400` | Attempt to access loopback, private IP, or metadata service |
| `PAYLOAD_TOO_LARGE` | `413` | Request body exceeds maximum size limit |
| `RATE_LIMIT_EXCEEDED` | `429` | Client exceeded requests-per-minute threshold |
| `UNSUPPORTED_URL` | `422` | Domain or URL pattern is not supported |
| `PROVIDER_NOT_FOUND` | `404` | Media was deleted, does not exist, or account is private |
| `CAPABILITY_UNSUPPORTED`| `403` | Feature restricted by platform terms or access controls |
| `PROVIDER_TIMEOUT` | `504` | External upstream provider took longer than timeout |
| `PROVIDER_ERROR` | `502` | Upstream provider returned an unrecoverable error |
| `INTERNAL_ERROR` | `500` | Unexpected server error |

---

## Platform Capabilities & Current Limitations

| Platform | Implemented Legitimate Features | Platform Restrictions & Limitations |
| :--- | :--- | :--- |
| **YouTube** | • Full URL and ID detection (shorts, youtu.be, watch)<br>• Official oEmbed metadata (title, author, thumbnail)<br>• Rich metadata via official YouTube Data API v3 (duration, descriptions)<br>• High-resolution thumbnail delivery | • Direct binary video downloading violates YouTube Terms of Service & DRM policies.<br>• Cloudflare Workers cannot run FFmpeg or stream deciphering algorithms. |
| **TikTok** | • Shortlink resolution (`vm.tiktok.com`, `vt.tiktok.com`)<br>• Official oEmbed metadata & author unique IDs<br>• High-quality official thumbnail delivery | • Direct proprietary video extraction requires bypassing TikTok anti-automation access controls, which is strictly prohibited. |
| **Instagram** | • Shortcode detection (`/p/`, `/reel/`, `/reels/`, `/tv/`)<br>• Official Meta Graph API oEmbed integration | • Meta enforces mandatory App Access Tokens for public oEmbed.<br>• Scraping Instagram without authorization violates Meta Platform Terms. |

---

## WhatsApp Bot Integration (AWS Lightsail)

Your WhatsApp bot running on AWS Lightsail can connect to Zoxer Media API without altering your existing session management or pairing codes.

A complete reference client is included in [`examples/whatsapp-bot-client.js`](./examples/whatsapp-bot-client.js).

### Setup in your Lightsail WhatsApp Bot:

1. Add environment variables to your bot's `.env` on AWS Lightsail:
   ```ini
   ZOXER_API_URL="https://zoxer-media-api.<your-subdomain>.workers.dev"
   ZOXER_API_KEY="your_secure_worker_secret_key"
   ```

2. Import the handler into your Baileys message listener:
   ```javascript
   import { handleSocialMediaMessage } from './examples/whatsapp-bot-client.js';

   sock.ev.on('messages.upsert', async ({ messages, type }) => {
     const msg = messages[0];
     if (!msg.message || msg.key.fromMe) return;

     const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
     const urlMatch = text.match(/https?:\/\/[^\s]+/i);

     if (urlMatch) {
       await handleSocialMediaMessage(sock, msg, urlMatch[0]);
     }
   });
   ```

---

## Cloudflare Workers Deployment

> [!IMPORTANT]
> Do not deploy automatically without completing local testing and setting production secrets.

### Step 1: Login to Cloudflare via Wrangler

```bash
npx wrangler login
```

### Step 2: Set the Production Secret Key

Store your secret token securely in Cloudflare's encrypted key vault:

```bash
npx wrangler secret put API_SECRET_KEY
```
*(Enter your chosen 32+ character random secret string when prompted).*

Optional provider secrets:
```bash
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put INSTAGRAM_ACCESS_TOKEN
```

### Step 3: Run Verification Suite

Ensure all tests pass and TypeScript types are valid:

```bash
npm run typecheck
npm test
```

### Step 4: Deploy to Cloudflare

Deploy your worker to production:

```bash
npm run deploy
```

Wrangler will output your live endpoint URL (e.g., `https://zoxer-media-api.<account>.workers.dev`).

---

## Testing

Zoxer Media API includes 47 unit and integration tests covering security, authentication, SSRF protection, platform detection, and mock provider interactions.

To run tests:
```bash
npm test
```

To run tests in watch mode:
```bash
npm run test:watch
```

To verify TypeScript compilation:
```bash
npm run typecheck
```

---

## Troubleshooting

### 1. `401 UNAUTHORIZED: Invalid or unauthorized API key`
- Ensure your bot sends `Authorization: Bearer <token>` in headers.
- Verify that the token matches `API_SECRET_KEY` configured in Cloudflare Secrets or `.dev.vars`.

### 2. `400 SSRF_ATTEMPT_DETECTED`
- The submitted URL resolved to a private IP, loopback, or cloud metadata address (`169.254.169.254`).
- Ensure you are passing legitimate public social media links.

### 3. `429 RATE_LIMIT_EXCEEDED`
- Your client made more requests than permitted by `RATE_LIMIT_MAX_REQUESTS` within the window.
- Check the `Retry-After` header returned in the response.

---

## License

Private and proprietary. Built exclusively for Sarukh Mazari's WhatsApp Bot integration.
