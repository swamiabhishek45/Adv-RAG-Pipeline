# Advanced RAG Course Subtitle Assistant

Full-stack Next.js app for asking questions against Udemy course subtitle files and returning answer citations with lesson names and timestamps.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill `OPENAI_API_KEY`, `DATABASE_URL`, and optionally `MONGODB_URI`.
3. Put subtitles at `class-subtitle/`, or set `SUBTITLE_ROOT` to the folder that contains the module folders.
4. Ingest subtitles:

```bash
npm run ingest -- --reset
```

Use `npm run ingest -- --dry-run` to validate parsing and chunking without database or OpenAI calls.

5. Start the app:

```bash
npm run dev
```

## Pipeline

```mermaid
graph TD
    User([User Question]) --> IG[Input Guardrails]
    
    IG -- Allowed --> QT["Query Translation (Promise.all)"]
    IG -- Blocked --> BlockedEnd([Return Blocked Reason])
    
    subgraph "Query Translation Phase"
        QT --> Q_Orig[Original Query]
        QT --> Q_SB[Step-Back Query]
        QT --> Q_RW[Rewrite Query]
        QT --> Q_SQ[Sub-Questions]
        QT --> Q_HyDE[HyDE Hypothetical Answer]
    end

    Q_Orig & Q_SB & Q_RW & Q_SQ & Q_HyDE --> Retrieve["Retrieve For Variants (Promise.all)"]

    subgraph "Variant Routing & Search Phase"
        Retrieve --> RouteDecision{Route Decision LLM}
        RouteDecision -- "Vector / Both" --> VecAdapter["Vector Adapter (OpenAI Embeddings)"]
        RouteDecision -- "SQL / Both" --> SQLAdapter["SQL Adapter (PostgreSQL Query Generator)"]
        
        VecAdapter --> VecSearch[("Postgres Vector Cosine Search")]
        SQLAdapter --> SQLSearch[("Postgres Structured Search")]
    end

    VecSearch & SQLSearch --> RRF["Reciprocal Rank Fusion (RRF)"]
    RRF --> TopDocs["Top 5 Retrieved Documents"]

    subgraph "Corrective RAG LangGraph"
        TopDocs --> NodeGen["generate Node (Generate Answer)"]
        NodeGen --> NodeScore["score Node (Relevance Scorer)"]
        
        NodeScore -- "Score >= 6 OR Max Retries" --> Done[Done]
        NodeScore -- "Score < 6" --> NodeRetMore["retrieve_more Node (Identify Missing Keywords)"]
        
        NodeRetMore --> Retrieve
    end

    Done --> SaveLog["Async Save RAG Trace (MongoDB)"]
    Done --> OG[Output Guardrails]
    
    OG --> FinalResponse([Final Answer + Citations])
```

- Phase 1: `scripts/ingest.ts`, `lib/subtitles.ts`, `lib/db.ts`
- Phase 2: `lib/pipeline.ts`, `lib/generation.ts`, `app/api/ask/route.ts`, `app/page.tsx`
- Phase 3: `lib/guardrails.ts`, `lib/query-translation.ts`
- Phase 4: `lib/retrieval.ts`
- Phase 5: `lib/corrective-rag.ts`
- Phase 6: `lib/guardrails.ts`
