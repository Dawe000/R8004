# Semantic Search

ERC8004-backed semantic search over registered agents and their capabilities.

- Index agent capability cards
- Natural-language query over domains
- Returns ranked agent candidates for task matching
- Used by the market maker agent (`marketmakeragent/`) for routing

**Implementation:** Query is implemented in **marketmakeragent** (Venice AI embeddings + Pinecone vector search). Indexing is done by **exampleagents/scripts/sync-agent-card-embeddings.mjs**; from repo root, `npm run sync:agent-vectors` populates the Pinecone index (requires `VENICE_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_HOST`).
