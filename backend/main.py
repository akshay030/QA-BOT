from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from dotenv import load_dotenv

from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_groq import ChatGroq
from langchain_core.documents import Document
from pydantic import BaseModel
from fastapi import FastAPI, UploadFile, File, HTTPException

from langchain.tools import tool
from langchain.agents import create_agent

from langchain_text_splitters import RecursiveCharacterTextSplitter

from pypdf import PdfReader
from io import BytesIO

from tavily import TavilyClient

load_dotenv()


# ==============================================================================
# Global State
# ==============================================================================

vectorstore: Chroma | None = None

# Conversation history — list of {"role": "...", "content": "..."}
chat_history: list[dict] = []

# Timestamp of the last message — used to check if 30 mins have passed
last_message_time: datetime | None = None

MEMORY_TIMEOUT = timedelta(minutes=30)


# ==============================================================================
# Helpers
# ==============================================================================

def clear_vectorstore():
    global vectorstore
    if vectorstore is not None:
        vectorstore.delete_collection()
        vectorstore = None


def clear_history():
    global chat_history, last_message_time
    chat_history = []
    last_message_time = None


def check_and_expire_history():
    """If 30 minutes have passed since the last message, wipe the history."""
    global last_message_time
    if last_message_time and datetime.now() - last_message_time > MEMORY_TIMEOUT:
        clear_history()
        print("Chat history expired after 30 minutes of inactivity.")


# ==============================================================================
# Lifespan — runs on startup / shutdown
# ==============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    clear_vectorstore()
    clear_history()
    print("Cleaned up on shutdown.")


# ==============================================================================
# App
# ==============================================================================

app = FastAPI(
    title="RAG Chatbot API",
    description="Chat with AI. Remembers conversation for 30 mins. Upload a PDF to ask questions about it.",
    version="1.0.0",
    lifespan=lifespan
)
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# Request / Response models
# ==============================================================================

class ChatRequest(BaseModel):
    question: str


class UploadResponse(BaseModel):
    message: str
    chunks_indexed: int


# ==============================================================================
# LLM, Embeddings, Web Search
# ==============================================================================

llm = ChatGroq(model="qwen/qwen3-32b")

embeddings = GoogleGenerativeAIEmbeddings(model="gemini-embedding-001")

tavily = TavilyClient()


# ==============================================================================
# Tools
# ==============================================================================

@tool
def rag_search(query: str) -> str:
    """
    Search the uploaded PDF document for relevant information.
    Use this when the user asks about the document, PDF, file, or its contents.
    """
    if vectorstore is None:
        return "No PDF has been uploaded yet."

    docs = vectorstore.similarity_search(query, k=4)

    if not docs:
        return "No relevant information found in the document."

    results = []
    for i, doc in enumerate(docs, start=1):
        page = doc.metadata.get("page", "?")
        results.append(f"Result {i} (Page {page}):\n{doc.page_content}")

    return "\n\n---\n\n".join(results)


@tool
def web_search(query: str) -> str:
    """
    Search the web for current events, news, live data, weather, prices,
    or anything that needs up-to-date information beyond training data.
    """
    response = tavily.search(query=query, search_depth="advanced", max_results=5)

    results = []
    for item in response.get("results", []):
        results.append(
            f"Title: {item['title']}\nURL: {item['url']}\nContent: {item['content']}"
        )

    return "\n\n---\n\n".join(results) if results else "No results found."


# ==============================================================================
# Agent
# ==============================================================================

agent = create_agent(
    model=llm,
    tools=[rag_search, web_search],
    system_prompt="""You are a helpful AI assistant. You have three ways to answer:

1. From your own knowledge — for general questions, coding, math, history, etc.
2. rag_search tool — when the user asks about an uploaded PDF or document.
3. web_search tool — when the user needs current/live information like news or weather.

Pick the right approach based on the question. Be clear and concise."""
)


# ==============================================================================
# Endpoints
# ==============================================================================

@app.get("/")
def home():
    return {
        "message": "RAG Chatbot is running!",
        "pdf_loaded": vectorstore is not None,
        "chat_history_length": len(chat_history),
        "endpoints": {
            "chat":          "POST /chat   — send { \"question\": \"...\" }",
            "upload":        "POST /upload — upload a PDF file",
            "clear_history": "POST /clear  — manually clear chat history",
            "health":        "GET  /health",
        }
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "pdf_loaded": vectorstore is not None,
        "chat_history_length": len(chat_history),
        "last_message_time": last_message_time.isoformat() if last_message_time else None,
    }


@app.post("/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF. Any previously uploaded PDF is automatically replaced."""
    global vectorstore

    clear_vectorstore()

    contents = await file.read()
    pdf = PdfReader(BytesIO(contents))

    pages = []
    for i, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(Document(page_content=text, metadata={"page": i + 1}))

    if not pages:
        raise HTTPException(status_code=422, detail="PDF seems empty or could not be read.")

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_documents(pages)

    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        collection_name="uploaded_pdf"
    )

    return UploadResponse(
        message=f"'{file.filename}' uploaded! Ask questions about it at /chat.",
        chunks_indexed=len(chunks)
    )


@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Ask any question. Conversation is remembered for 30 minutes of inactivity.
    Send: { "question": "your question here" }
    """
    global chat_history, last_message_time

    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Please provide a question.")

    # Wipe history if 30 mins have passed since the last message
    check_and_expire_history()

    # Add the new user message to history
    chat_history.append({"role": "user", "content": request.question})

    try:
        # Pass the full conversation history to the agent so it has context
        result = agent.invoke({"messages": chat_history})

        answer = result["messages"][-1].content

        # Save the assistant reply to history too
        chat_history.append({"role": "assistant", "content": answer})

        # Update the last activity timestamp
        last_message_time = datetime.now()

        return {"answer": answer}

    except Exception as e:
        # Remove the user message we just added if the request failed
        chat_history.pop()
        raise HTTPException(status_code=500, detail=f"Something went wrong: {str(e)}")


@app.post("/clear")
def clear_chat():
    """Manually clear the chat history."""
    clear_history()
    return {"message": "Chat history cleared."}