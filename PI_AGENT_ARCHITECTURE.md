# Pi Agent Architecture - Penjelasan Singkat

## 🎯 Jawaban Singkat

**YA, kita menggunakan Pi Agent sebagai core** - TAPI ada **2 jalur berbeda**:

1. **Pi Agent SDK** (untuk Anthropic, OpenAI, Google, dll) ✅
2. **Custom Mantle Provider** (untuk Bedrock/AWS models) ⚠️

## 📊 Visual Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USER REQUEST                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              apps/server/src/pi/index.ts                     │
│                   runPiQuery()                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ Check provider
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
    ┌─────────────────┐      ┌──────────────────────┐
    │  isMantle?      │      │  Other Providers?    │
    │  (Bedrock)      │      │  (Anthropic, etc)    │
    └────────┬────────┘      └──────────┬───────────┘
             │                          │
             │ YES                      │ NO
             │                          │
             ▼                          ▼
┌──────────────────────────┐  ┌─────────────────────────────┐
│  CUSTOM IMPLEMENTATION   │  │    PI AGENT SDK             │
│  bedrock-mantle-         │  │    @mariozechner/           │
│  provider.ts             │  │    pi-coding-agent          │
│                          │  │                             │
│  ❌ Manual tool loop     │  │  ✅ Built-in tool loop      │
│  ❌ Manual streaming     │  │  ✅ Built-in streaming      │
│  ❌ Manual iteration     │  │  ✅ Built-in iteration      │
│  ⚠️  WE CONTROL THIS     │  │  ✅ SDK CONTROLS THIS       │
└──────────────────────────┘  └─────────────────────────────┘
             │                          │
             └────────────┬─────────────┘
                          │
                          ▼
                    ┌──────────┐
                    │  TOOLS   │
                    │  (same)  │
                    └──────────┘
```

## 🔍 Detail Routing Logic

**File**: `apps/server/src/pi/index.ts` (line ~260)

```typescript
// Check if this is Bedrock Mantle
const isMantle = isMantleProvider(piProvider);

if (isMantle) {
  // 🔴 CUSTOM PATH - We implement the agentic loop ourselves
  for await (const chunk of streamBedrockMantle(...)) {
    yield chunk;
  }
  return; // Exit early - don't use Pi Agent SDK
}

// 🟢 PI AGENT SDK PATH - SDK handles everything
const result = await createAgentSession({
  authStorage,
  model: piModel,
  tools,
  // ... SDK handles tool loop, streaming, etc
});
```

## ❓ Kenapa Ada 2 Jalur?

### Jalur 1: Pi Agent SDK (Recommended)

**Providers**: Anthropic, OpenAI, Google, Groq, XAI, Mistral, dll

**Keuntungan**:

- ✅ SDK handle semua complexity
- ✅ Automatic tool loop (no iteration limit!)
- ✅ Automatic streaming
- ✅ Battle-tested
- ✅ **TIDAK ADA MASALAH BERHENTI DI TENGAH JALAN**

### Jalur 2: Custom Mantle (Problematic)

**Providers**: AWS Bedrock (GLM-5, Kimi K2.5, GPT OSS)

**Kenapa custom?**:

- Bedrock menggunakan OpenAI-compatible API (bukan native Pi Agent)
- Kita implement sendiri tool loop di `bedrock-mantle-provider.ts`

**Masalah**:

- ⚠️ Kita yang implement tool loop
- ⚠️ Kita yang set iteration limit (ini yang bikin berhenti!)
- ⚠️ Kita yang handle streaming
- ⚠️ **INI SUMBER MASALAH ANDA**

## 🐛 Root Cause Masalah Anda

```typescript
// bedrock-mantle-provider.ts (line ~400)
const maxIterations = 10; // ❌ INI MASALAHNYA!

while (iteration < maxIterations) {
  // ... tool calls
  iteration++;
}

// Iteration 10/10 → BERHENTI! ❌
```

**Log Anda**:

```
[BedrockMantle] Iteration 10/10
[BedrockMantle] Max iterations reached
```

Model masih mau lanjut, tapi kita paksa berhenti!

## ✅ Solusi

**Option 1**: Hapus iteration limit (trust the timeout protection)

```typescript
while (true) {
  // No limit!
  // Timeout protection will handle stuck streams
}
```

**Option 2**: Migrate Bedrock ke Pi Agent SDK (if possible)

- Check apakah Pi Agent SDK support Bedrock
- Hapus custom implementation

**Option 3**: Increase limit drastically

```typescript
const maxIterations = 100; // Very high limit
```

## 📝 Summary

| Aspect              | Pi Agent SDK           | Custom Mantle   |
| ------------------- | ---------------------- | --------------- |
| **Providers**       | Anthropic, OpenAI, etc | AWS Bedrock     |
| **Tool Loop**       | ✅ SDK handles         | ⚠️ We implement |
| **Iteration Limit** | ✅ None (SDK decides)  | ❌ 10 (we set)  |
| **Streaming**       | ✅ SDK handles         | ⚠️ We implement |
| **Reliability**     | ✅ High                | ⚠️ Lower        |
| **Your Issue**      | ✅ No problem          | ❌ Stops at 10  |

## 🎯 Kesimpulan

**Anda BENAR** - kita seharusnya rely pada Pi Agent!

**Tapi** untuk Bedrock, kita **tidak menggunakan Pi Agent SDK**, kita implement sendiri. Ini yang bikin masalah.

**Fix**: Hapus iteration limit di custom Mantle provider, trust timeout protection yang sudah kita buat.
