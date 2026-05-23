https://qa-436tjpo2p-akshays-projects-0b8110d2.vercel.app
# QA Bot

This repository contains a RAG (Retrieval-Augmented Generation) chatbot backend and a React frontend.

Folders
- `backend/` — FastAPI application providing endpoints: `/upload`, `/chat`, `/clear`, `/health`.
- `ui/vite-project/` — Vite + React frontend that talks to the backend at `http://localhost:8000` by default.
- `UI/` — an alternate frontend copy (if present).

Quickstart

Prerequisites
- Python 3.10+ (for the backend)
- Node.js 18+ and npm

Run the backend

1. Create and activate a virtual environment (Windows example):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies and start the server:

```powershell
pip install -r backend/requirements.txt
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Run the frontend

1. Install dependencies and start the dev server (from repo root):

```bash
cd ui/vite-project
npm install
npm run dev
```

By default the frontend expects the backend at `http://localhost:8000`. If needed, set `VITE_API_BASE` in the frontend environment.

Notes
- Upload a PDF through the UI to enable document search. Conversation memory persists for 30 minutes of inactivity.
- CORS is enabled for `http://localhost:5173` and `http://localhost:3000` in the backend.

If you want I can tidy duplicate UI folders or consolidate the frontends into a single folder.

## Project summary

QA Bot is a Retrieval-Augmented Generation (RAG) chatbot that lets users upload a PDF and ask
questions about its contents. The backend (FastAPI) ingests PDFs, splits them into chunks,
indexes embeddings in a Chroma vectorstore, and exposes chat endpoints which route queries to
an agent (Groq LLM) that can use tools: a `rag_search` tool that queries the vectorstore and a
`web_search` tool (Tavily) for live information. Conversation context is kept in-memory for 30
minutes of inactivity to allow short-term conversation continuity.

## Backend architecture

The following diagram shows the main data flow and components of the backend.

```mermaid
flowchart LR
	subgraph Client
		U[User / Frontend]
	end

	subgraph Backend [FastAPI Backend]
		Upload[/POST /upload\n(parse PDF)]
		Parser[PDF Reader \n→ Text Pages]
		Splitter[Text Splitter \n→ Chunks]
		Embedding[Embeddings]
		Vectorstore[Chroma Vectorstore]

		Chat[/POST /chat\n(receive question)]
		Agent[Agent (ChatGroq)]
		RAG[rag_search tool]\n(similarity_search)
		Web[web_search tool\n(Tavily)]
		History[(Chat History\n(in-memory, 30m ttl))]
	end

	U -->|upload PDF| Upload --> Parser --> Splitter --> Embedding --> Vectorstore
	U -->|ask question| Chat --> Agent
	Agent -->|use rag_search| RAG --> Vectorstore
	Agent -->|use web_search| Web
	Agent -->|respond| U
	Chat --> History
	Agent --> History

	classDef backend fill:#0b2440,stroke:#0a2340,color:#fff;
	class Backend backend;
```

This diagram captures the main runtime interactions: users upload PDFs which are parsed,
chunked, embedded and stored in Chroma. When a user asks a question the agent decides whether
to answer from its internal knowledge, call `rag_search` to retrieve document passages, or call
`web_search` for live data. Conversation history is appended for context and expires after 30 minutes
of inactivity.
