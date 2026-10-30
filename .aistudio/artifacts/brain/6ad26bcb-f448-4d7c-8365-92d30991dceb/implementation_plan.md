# Urgent Hotfix: Restore Gemini 3.x / Latest Model Cascade & Live Model Discovery Fallback

Restore the active Gemini 3.x and `gemini-flash-latest` model pool across all AI extraction, quick-assist, API health-check, and backend fallback flows—removing deprecated `gemini-2.5-*` models that return `[404] This model is no longer available to new users` and adding dynamic `v1beta/models` discovery as a self-healing safety net.

### User Review & Critical Decisions

> [!IMPORTANT]
> Both key operational behaviors were confirmed during Phase 1 clarification and are baked into this plan:

- **Confirmed Decision 1 — Exhaustive Live Discovery Fallback**: If the static Gemini 3.x cascade fails due to 404/unavailable errors, the client queries `v1beta/models`, filters and ranks active `generateContent`-capable `gemini-*` models (prioritizing `flash` and `3.` models while excluding `2.5`, `1.5`, `embedding`, `imagen`, `veo`, `tts`, and `audio`), and retries **all** discovered active models not already attempted in priority order before throwing an error.
- **Confirmed Decision 2 — Model-Aware API Key Health Test**: When the Settings Hub API Key Health Test succeeds on a model in the cascade, the status banner and toast display both the connected model ID and response latency (e.g., `Connected via gemini-3.1-flash-lite in 240ms`).

---

### 1. Overview & Core Concept

- **What It Does**: Eliminates 404 model deprecation failures across Document/Text AI Extraction, CRM Quick Assist (Note Summarization & WhatsApp Drafting), Settings API Key Health Checks, and the Express server's retry pool by restoring the Gemini 3.x + `gemini-flash-latest` cascade and adding live `v1beta/models` runtime model discovery.
- **Target Audience / Persona**: Sales engineers, estimation teams, and administrators using AI document autofill, CRM note refinement, and system diagnostics.
- **Key Value**: Zero-downtime AI extraction even when upstream model aliases rotate or regional preview endpoints fluctuate.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  - **Enquiry AI Extraction & Smart Autofill**: Users selecting "Auto-Cascade" or a specific Gemini 3.x model see real-time status updates (`Querying gemini-3.8-flash...`, `Auto-failing over...`, `Discovering live models...`) without hitting 404 dead-ends from retired `gemini-2.5-*` IDs.
  - **Stored Model Preference Migration**: Any browser with a stale `gemini-2.5-*` or `gemini-3.1-pro` value saved in `localStorage` automatically resets to `'auto'` (`gemini-3.8-flash` flagship default) on load.
  - **Settings Hub API Key Health Check**: Clicking **Test API Key** iterates through the active Gemini 3.x / latest cascade and reports the exact connected model name and round-trip latency in milliseconds.
- **Visual Identity & Theme**:
  - Strictly preserves existing application layouts, Quotation Studio components, and Tailwind styling tokens (`Do NOT touch any UI layouts or Quotation Studio files`).

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Static Gemini 3.x Cascade + Dynamic `v1beta/models` Discovery**:
  - *Chosen Approach*: Maintain an ordered 9-model static cascade starting with `gemini-3.8-flash` down through `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, `gemini-flash-latest`, and `gemini-3.1-pro-preview`, backed by live `GET /v1beta/models` discovery if the static list is exhausted.
  - *Why*: Fast zero-overhead execution on the primary cascade, plus automatic self-healing if Google promotes new model identifiers in `v1beta`.
  - *Alternatives Considered*: Relying solely on a static array (vulnerable to future model retirement) or querying `/v1beta/models` before every request (adds unnecessary latency on normal requests).
- **Decision 2 — Synchronized Client & Server Fallback Pools**:
  - *Chosen Approach*: Align client-side extraction, quick-assist, Settings health check, and the server-side `retryWithBackoffAndFallback` pool (`retries = modelsPool.length = 5`) on Gemini 3.x and `gemini-flash-latest`.
  - *Why*: Ensures every retry attempt rotates to a distinct, supported Gemini 3.x / latest model rather than exhausting retries before reaching the end of the pool.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Enquiry Form & Settings Hub                       │
│  • Auto-migrates stale 'gemini-2.5*' localStorage preference -> 'auto'  │
│  • Resolves 'auto' -> 'gemini-3.8-flash' primary model                  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Static Gemini 3.x / Latest Cascade                     │
│  1. gemini-3.8-flash          6. gemini-3.1-flash-lite                  │
│  2. gemini-3.7-flash          7. gemini-3-flash-preview                 │
│  3. gemini-3.6-flash          8. gemini-flash-latest                    │
│  4. gemini-3.5-flash          9. gemini-3.1-pro-preview                 │
│  5. gemini-3.5-flash-lite                                               │
└───────────────┬───────────────────────────────────────┬─────────────────┘
                │ (If all static models 404/unavailable)│ (Server Proxy)
                ▼                                       ▼
┌───────────────────────────────────────────┐ ┌───────────────────────────┐
│   Live Discovery Fallback (v1beta/models) │ │ Server Retry Pool (5x)    │
│  • Filters 'generateContent' + 'gemini-*' │ │ • gemini-3.1-flash-lite   │
│  • Excludes 2.5, 1.5, tts, audio, imagen  │ │ • gemini-3.6-flash        │
│  • Ranks 'flash' & '3.' first             │ │ • gemini-3-flash-preview  │
│  • Retries all untried discovered models  │ │ • gemini-flash-latest     │
└───────────────────────────────────────────┘ │ • gemini-3.1-pro-preview  │
                                              └───────────────────────────┘
```

- **Data Model & State**:
  - `AVAILABLE_GEMINI_MODELS` & `DEFAULT_MODEL_CASCADE`: Canonical model catalog and ordered failover array exported for UI selectors, extraction, quick assist, and API health testing.
  - `discoverLiveGeminiModels(apiKey)`: Queries `https://generativelanguage.googleapis.com/v1beta/models`, strips the `models/` prefix, filters for `supportedGenerationMethods.includes('generateContent')`, excludes deprecated/non-text families (`2.5`, `1.5`, `embedding`, `imagen`, `veo`, `tts`, `audio`), and sorts `flash` and `3.` models first.
- **Interactive Component & State Mapping**:
  - **Enquiry Extraction & Quick Assist**: Iterates through `modelSequence`; if all static models fail with recoverable/404 errors, invokes `discoverLiveGeminiModels(apiKey)` and retries each discovered model not already in `modelSequence` before surfacing `lastError`.
  - **Enquiry Form Model State**: Sanitizes `omni_gemini_model_preference` on initialization so deprecated `gemini-2.5*` or `gemini-3.1-pro` entries reset to `'auto'`, and maps `'auto'` to `'gemini-3.8-flash'`.
  - **Settings Hub API Key Health Check**: Loops through active cascade models (`['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview']` + `DEFAULT_MODEL_CASCADE`), recording the first responding model and displaying its name and latency.
  - **Server Retry Pool**: Updates `modelsPool` to `["gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-3-flash-preview", "gemini-flash-latest", "gemini-3.1-pro-preview"]` and sets default `retries = modelsPool.length` (`5`).
