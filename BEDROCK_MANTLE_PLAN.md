# Bedrock Mantle Integration Plan

## Problem Summary
- Native AWS Bedrock Converse API menggunakan AWS Access Key + Secret Key dengan Signature v4
- Model `zai.glm-5` dan lainnya diakses via **Bedrock Mantle** (OpenAI-compatible API) dengan API Key (Bearer token)
- Pi Agent SDK hanya mendukung native Bedrock (Converse API), bukan Mantle
- Kita perlu implementasi custom provider untuk Mantle

## Solution: Custom Bedrock Mantle Provider

### API Details
- **Base URL**: `https://bedrock-mantle.ap-southeast-3.api.aws/v1`
- **Auth**: Bearer token (API Key)
- **API Format**: OpenAI-compatible (`/chat/completions`)
- **Streaming**: Supported via SSE

### Environment Variables (.env)
```bash
BEDROCK_API_KEY=ABSKQmVkcm9ja0FQSUtleS03b2dkLWF0LTE3OTk2ODQwMDE1ODowRDV3L1NJWkJYNmI5VGxlQ3JKK3hUWnZpQUpxQVFxQVZtNUp3Wk5nTEJkZUR5Y0ZOUFZmSWFvWjJrRT0=
BEDROCK_BASE_URL=https://bedrock-mantle.ap-southeast-3.api.aws/v1
```

### Implementation Plan

#### 1. Create Bedrock Mantle Provider
File: `/apps/server/src/providers/bedrock-mantle-provider.ts`

```typescript
// OpenAI-compatible streaming client for Bedrock Mantle
// - Uses fetch for HTTP requests
// - SSE for streaming
// - Yields normalized StreamChunk events
// - Models: zai.glm-5, moonshotai.kimi-k2.5, openai.gpt-oss-120b
```

#### 2. Update Provider Registry
File: `/apps/server/src/providers/index.ts`

- Add `bedrock-mantle` as new provider
- Map `bedrock` alias to `bedrock-mantle` (or keep native as fallback)

#### 3. Update Credential Resolution
File: `/apps/server/src/pi/credentials.ts`

- Add `BEDROCK_API_KEY` and `BEDROCK_BASE_URL` to env map
- Return `source: 'env'` when BEDROCK_API_KEY is set

#### 4. Update Frontend Model List
File: `/apps/web/src/lib/constants.ts`

- Add Bedrock Mantle models:
  - `zai.glm-5` (GLM-5)
  - `moonshotai.kimi-k2.5` (Kimi K2.5)
  - `openai.gpt-oss-120b` (GPT OSS 120B)

#### 5. Update Chat Route
File: `/apps/server/src/routes/chats.ts`

- Detect when provider is `bedrock` with Mantle API key
- Route to Mantle provider instead of native Bedrock

### Models Available
| Model ID | Name | Context | Notes |
|----------|------|---------|-------|
| `zai.glm-5` | GLM-5 | 128K | Reasoning model |
| `moonshotai.kimi-k2.5` | Kimi K2.5 | 128K | General purpose |
| `openai.gpt-oss-120b` | GPT OSS 120B | 128K | Open source |

### Working Test Command
```bash
curl -X POST "https://bedrock-mantle.ap-southeast-3.api.aws/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ABSKQmVkcm9ja0FQSUtleS03b2dkLWF0LTE3OTk2ODQwMDE1ODowRDV3L1NJWkJYNmI5VGxlQ3JKK3hUWnZpQUpxQVFxQVZtNUp3Wk5nTEJkZUR5Y0ZOUFZmSWFvWjJrRT0=" \
  -d '{
    "model": "zai.glm-5",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

### SSE Response Format
```
data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}],"model":"zai.glm-5",...}
```

### Files to Modify
1. `apps/server/src/providers/bedrock-mantle-provider.ts` (NEW)
2. `apps/server/src/providers/index.ts` (UPDATE)
3. `apps/server/src/pi/credentials.ts` (UPDATE)
4. `apps/server/src/pi/index.ts` (UPDATE - route to Mantle provider)
5. `apps/web/src/lib/constants.ts` (UPDATE - add models)
6. `.env` (UPDATE - done)

### Order of Implementation
1. Create `bedrock-mantle-provider.ts` with streaming support
2. Update `credentials.ts` to detect Mantle vs Native
3. Update `pi/index.ts` to use Mantle provider when API key present
4. Update frontend constants with new models
5. Test end-to-end

### Key Differences: Mantle vs Native Bedrock
| Aspect | Mantle | Native |
|--------|--------|--------|
| Auth | Bearer token (API Key) | AWS Signature v4 |
| API | OpenAI-compatible | Converse API |
| Endpoint | `/v1/chat/completions` | Bedrock Runtime |
| Models | Subset (GLM, Kimi, etc) | All Bedrock models |
| Req'd Env | `BEDROCK_API_KEY` | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` |

## Notes
- User's Pi setup uses `~/.pi/agent/models.json` with `api: "openai-completions"`
- This is a custom provider configuration, not standard Pi SDK
- We need to implement similar logic in our backend