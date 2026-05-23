import { useState, useRef, useEffect } from "react";
import ReactMarkdown from 'react-markdown'

const API = meta.env.VITE_API_URL || "http://localhost:8000";

const COLORS = {
  bg: "#0d0d0d",
  surface: "#161616",
  surfaceHover: "#1e1e1e",
  border: "#2a2a2a",
  borderHover: "#3a3a3a",
  accent: "#c4a882",
  accentDim: "#8b7355",
  text: "#e8e3da",
  textMuted: "#7a7570",
  textDim: "#4a4540",
  userBubble: "#1a1a1a",
  aiBubble: "#161616",
  danger: "#c4614a",
  success: "#6ab187",
};

const SUGGESTIONS = [
  "Summarise the uploaded document",
  "What's the latest AI news?",
  "Explain machine learning simply",
  "Fastest LLM for text generation",
];

function ThinkingDots() {
  return (
    <>
      <style>{`
        @keyframes pulse { 0%,80%,100%{opacity:.2;transform:scale(.85)} 40%{opacity:1;transform:scale(1)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        .msg-appear { animation: fadeIn 0.25s ease forwards; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 4px; }
        * { box-sizing: border-box; }

        /* ── Responsive ── */
        @media (max-width: 640px) {
          .sidebar       { position:fixed!important; left:0; top:0; bottom:0; z-index:100;
                           transform:translateX(-100%); transition:transform .25s ease; width:280px!important; }
          .sidebar.open  { transform:translateX(0)!important; }
          .overlay       { display:block!important; }
          .topbar        { display:flex!important; }
          .input-hint    { display:none!important; }
          .msg-row       { padding:0 12px!important; }
          .chat-area     { padding-top:16px!important; }
          .input-area    { padding:10px 12px 16px!important; }
        }
        @media (min-width: 641px) {
          .topbar  { display:none!important; }
          .overlay { display:none!important; }
        }
      `}</style>
      <div style={{ display:"flex", gap:"5px", padding:"14px 0", alignItems:"center" }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width:"7px", height:"7px", borderRadius:"50%",
            background: COLORS.accentDim,
            animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite`
          }}/>
        ))}
      </div>
    </>
  );
}

export default function App() {
  const [messages,     setMessages]     = useState([]);
  const [input,        setInput]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [pdf,          setPdf]          = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadHover,  setUploadHover]  = useState(false);
  const [error,        setError]        = useState(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);

  const bottomRef   = useRef(null);
  const fileRef     = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const autoResize = (el) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const sendMessage = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setError(null);
    setMessages(m => [...m, { role:"user", content:q }]);
    setLoading(true);
    try {
      const res  = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Request failed"); }
      const data = await res.json();
      setMessages(m => [...m, { role:"assistant", content:data.answer }]);
    } catch(e) {
      setError(e.message);
      setMessages(m => m.slice(0,-1));
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) { setError("Please upload a PDF file."); return; }
    setUploading(true); setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res  = await fetch(`${API}/upload`, { method:"POST", body:form });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Upload failed"); }
      const data = await res.json();
      setPdf({ name:file.name, chunks:data.chunks_indexed });
      setMessages(m => [...m, { role:"assistant",
        content:`I've read "${file.name}" — ${data.chunks_indexed} passages indexed. Ask me anything about it.` }]);
    } catch(e) { setError(e.message); }
    finally    { setUploading(false); }
  };

  const clearHistory = async () => {
    try { await fetch(`${API}/clear`, { method:"POST" }); setMessages([]); setError(null); }
    catch(e) { setError("Could not clear history."); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setUploadHover(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  /* ─── Sidebar content (shared between desktop & mobile) ─── */
  const SidebarContent = () => (
    <>
      {/* Header */}
      <div style={{ padding:"24px 20px 16px", borderBottom:`1px solid ${COLORS.border}` }}>
        <div style={{ fontSize:"15px", fontWeight:"400", letterSpacing:"0.12em",
          color:COLORS.accent, textTransform:"uppercase", fontFamily:"'Georgia',serif", marginBottom:"4px" }}>
          Athena
        </div>
        <div style={{ fontSize:"11px", color:COLORS.textMuted, letterSpacing:"0.06em" }}>
          RAG · Web · Chat
        </div>
      </div>

      {/* Document section */}
      <div style={{ padding:"16px 20px 8px", fontSize:"10px", letterSpacing:"0.14em",
        color:COLORS.textDim, textTransform:"uppercase" }}>Document</div>

      {pdf ? (
        <div style={{ margin:"0 12px 8px", padding:"10px 12px", background:COLORS.surfaceHover,
          border:`1px solid ${COLORS.border}`, borderRadius:"8px",
          display:"flex", alignItems:"center", gap:"8px" }}>
          <i className="ti ti-file-text" style={{ fontSize:"18px", color:COLORS.accent }} aria-hidden="true"/>
          <div style={{ flex:1, overflow:"hidden" }}>
            <div style={{ fontSize:"12px", color:COLORS.text,
              whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{pdf.name}</div>
            <div style={{ fontSize:"10px", color:COLORS.textMuted, marginTop:"2px" }}>{pdf.chunks} passages indexed</div>
          </div>
          <i className="ti ti-x" style={{ fontSize:"14px", color:COLORS.textDim, cursor:"pointer" }}
            onClick={() => {
              setPdf(null);
              setMessages(m => [...m, { role:"assistant",
                content:"PDF removed. I'll answer from general knowledge and web search now." }]);
            }} aria-label="Remove PDF"/>
        </div>
      ) : (
        <div
          style={{ margin:"0 12px 8px", padding:"12px",
            border:`1px dashed ${uploadHover ? COLORS.accent : COLORS.border}`,
            borderRadius:"8px", cursor:"pointer", transition:"all .15s",
            display:"flex", flexDirection:"column", alignItems:"center", gap:"6px",
            background: uploadHover ? COLORS.surfaceHover : "transparent",
            opacity: uploading ? 0.6 : 1 }}
          onClick={() => !uploading && fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setUploadHover(true); }}
          onDragLeave={() => setUploadHover(false)}
          onDrop={handleDrop}
          role="button" aria-label="Upload PDF">
          <i className={uploading ? "ti ti-loader" : "ti ti-upload"}
            style={{ fontSize:"20px", color:COLORS.textMuted,
              animation: uploading ? "spin 1s linear infinite" : "none" }} aria-hidden="true"/>
          <div style={{ fontSize:"12px", color:COLORS.textMuted, textAlign:"center",
            lineHeight:"1.4", fontFamily:"'Georgia',serif" }}>
            {uploading ? "Indexing…" : "Upload PDF\nor drag & drop"}
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".pdf" style={{ display:"none" }}
        onChange={e => e.target.files[0] && handleUpload(e.target.files[0])}/>

      {/* Divider */}
      <div style={{ height:"1px", background:COLORS.border, margin:"12px 0" }}/>

      {/* Memory */}
      <div style={{ padding:"0 20px 8px", fontSize:"10px", letterSpacing:"0.14em",
        color:COLORS.textDim, textTransform:"uppercase" }}>Memory</div>
      <div style={{ margin:"0 12px 8px", padding:"10px 12px", background:COLORS.surfaceHover,
        borderRadius:"8px", fontSize:"11px", color:COLORS.textMuted, lineHeight:"1.6" }}>
        <span style={{ color:COLORS.accent }}>●</span> Active for 30 min<br/>Resets on page reload
      </div>

      {/* Clear button */}
      <button
        style={{ margin:"0 12px 8px", padding:"9px 12px", background:"transparent",
          border:`1px solid ${COLORS.border}`, borderRadius:"8px", color:COLORS.textMuted,
          fontSize:"12px", cursor:"pointer", display:"flex", alignItems:"center", gap:"8px",
          transition:"all .15s", fontFamily:"'Georgia',serif", width:"calc(100% - 24px)" }}
        onClick={clearHistory}
        onMouseOver={e => { e.currentTarget.style.borderColor=COLORS.danger; e.currentTarget.style.color=COLORS.danger; }}
        onMouseOut={e  => { e.currentTarget.style.borderColor=COLORS.border; e.currentTarget.style.color=COLORS.textMuted; }}>
        <i className="ti ti-trash" style={{ fontSize:"14px" }} aria-hidden="true"/>
        Clear conversation
      </button>

      {/* Footer */}
      <div style={{ marginTop:"auto", padding:"16px 20px",
        borderTop:`1px solid ${COLORS.border}`, fontSize:"11px",
        color:COLORS.textDim, lineHeight:"1.6" }}>
        Powered by Groq · Gemini · Tavily
      </div>
    </>
  );

  return (
    <div style={{ display:"flex", height:"100vh", width:"100%",
      background:COLORS.bg, fontFamily:"'Georgia','Times New Roman',serif",
      color:COLORS.text, overflow:"hidden", position:"relative" }}>

      {/* ── Mobile overlay ── */}
      <div className="overlay"
        style={{ display:"none", position:"fixed", inset:0,
          background:"rgba(0,0,0,0.6)", zIndex:99 }}
        onClick={() => setSidebarOpen(false)}/>

      {/* ── Sidebar ── */}
      <div className={`sidebar${sidebarOpen ? " open" : ""}`}
        style={{ width:"260px", minWidth:"260px", background:COLORS.surface,
          borderRight:`1px solid ${COLORS.border}`,
          display:"flex", flexDirection:"column" }}>
        <SidebarContent/>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column",
        overflow:"hidden", minWidth:0 }}>

        {/* Mobile top bar */}
        <div className="topbar"
          style={{ display:"none", alignItems:"center", gap:"12px",
            padding:"12px 16px", borderBottom:`1px solid ${COLORS.border}`,
            background:COLORS.surface }}>
          <button
            style={{ background:"transparent", border:"none", cursor:"pointer",
              color:COLORS.textMuted, padding:"4px", display:"flex" }}
            onClick={() => setSidebarOpen(o => !o)} aria-label="Open menu">
            <i className="ti ti-menu-2" style={{ fontSize:"20px" }}/>
          </button>
          <div style={{ fontSize:"14px", letterSpacing:"0.1em",
            color:COLORS.accent, textTransform:"uppercase" }}>Athena</div>
        </div>

        {/* Chat area */}
        <div className="chat-area"
          style={{ flex:1, overflowY:"auto", padding:"40px 0 20px",
            scrollbarWidth:"thin", scrollbarColor:`${COLORS.border} transparent` }}>

          {messages.length === 0 ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", height:"100%", gap:"16px", padding:"40px 24px" }}>
              <i className="ti ti-message-circle"
                style={{ fontSize:"40px", color:COLORS.textDim }} aria-hidden="true"/>
              <div style={{ fontSize:"22px", color:COLORS.text, fontWeight:"400",
                letterSpacing:"0.02em" }}>How can I help?</div>
              <div style={{ fontSize:"14px", color:COLORS.textMuted, textAlign:"center",
                maxWidth:"380px", lineHeight:"1.7" }}>
                Ask anything — I'll search your PDF, the web, or answer from my own knowledge.
              </div>
              <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", justifyContent:"center", marginTop:"8px" }}>
                {SUGGESTIONS.map(s => (
                  <div key={s}
                    style={{ padding:"8px 14px", background:COLORS.surface,
                      border:`1px solid ${COLORS.border}`, borderRadius:"20px",
                      fontSize:"12px", color:COLORS.textMuted, cursor:"pointer",
                      transition:"all .15s", fontFamily:"'Georgia',serif" }}
                    onClick={() => sendMessage(s)}
                    onMouseOver={e => { e.currentTarget.style.borderColor=COLORS.accent; e.currentTarget.style.color=COLORS.text; }}
                    onMouseOut={e  => { e.currentTarget.style.borderColor=COLORS.border; e.currentTarget.style.color=COLORS.textMuted; }}>
                    {s}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} className="msg-appear msg-row"
                  style={{ maxWidth:"760px", margin:"0 auto 2px",
                    padding:"0 24px", display:"flex", flexDirection:"column" }}>
                  {msg.role === "user" ? (
                    <>
                      <div style={{ fontSize:"11px", letterSpacing:"0.1em",
                        color:COLORS.accentDim, textTransform:"uppercase",
                        marginBottom:"6px", textAlign:"right" }}>You</div>
                      <div style={{ alignSelf:"flex-end",
                        background:COLORS.userBubble,
                        border:`1px solid ${COLORS.border}`,
                        borderRadius:"14px 14px 4px 14px",
                        padding:"12px 16px", fontSize:"15px", lineHeight:"1.7",
                        maxWidth:"80%", color:COLORS.text,
                        fontFamily:"'Georgia',serif" }}>
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:"11px", letterSpacing:"0.1em",
                        color:COLORS.textDim, textTransform:"uppercase",
                        marginBottom:"6px" }}>Athena</div>
                      {/* ── AI bubble with background colour ── */}
                      <div style={{ alignSelf:"flex-start",
                        background:COLORS.aiBubble,
                        border:`1px solid ${COLORS.border}`,
                        borderRadius:"4px 14px 14px 14px",
                        padding:"12px 16px", fontSize:"15px", lineHeight:"1.8",
                        maxWidth:"100%", color:COLORS.text,
                        fontFamily:"'Georgia',serif",
                        whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {loading && (
                <div className="msg-row"
                  style={{ maxWidth:"760px", margin:"0 auto 2px",
                    padding:"0 24px", display:"flex", flexDirection:"column" }}>
                  <div style={{ fontSize:"11px", letterSpacing:"0.1em",
                    color:COLORS.textDim, textTransform:"uppercase", marginBottom:"6px" }}>Athena</div>
                  <div style={{ alignSelf:"flex-start",
                    background:COLORS.aiBubble, border:`1px solid ${COLORS.border}`,
                    borderRadius:"4px 14px 14px 14px", padding:"4px 16px" }}>
                    <ThinkingDots/>
                  </div>
                </div>
              )}

              {error && (
                <div className="msg-row"
                  style={{ maxWidth:"760px", margin:"8px auto 2px",
                    padding:"0 24px" }}>
                  <div style={{ fontSize:"13px", color:COLORS.danger,
                    padding:"10px 14px", background:COLORS.surface,
                    border:`1px solid ${COLORS.danger}40`,
                    borderRadius:"8px", display:"flex", alignItems:"center", gap:"8px" }}>
                    <i className="ti ti-alert-circle" style={{ fontSize:"15px" }} aria-hidden="true"/>
                    {error}
                  </div>
                </div>
              )}

              <div ref={bottomRef}/>
            </>
          )}
        </div>

        {/* Input area */}
        <div className="input-area"
          style={{ padding:"16px 24px 24px", maxWidth:"760px",
            margin:"0 auto", width:"100%", boxSizing:"border-box" }}>
          <div style={{ display:"flex", alignItems:"flex-end", gap:"10px",
            background:COLORS.surface,
            border:`1px solid ${inputFocused ? COLORS.accentDim : COLORS.border}`,
            borderRadius:"14px", padding:"12px 12px 12px 16px",
            transition:"border-color .15s" }}>
            <textarea
              ref={textareaRef}
              style={{ flex:1, background:"transparent", border:"none", outline:"none",
                color:COLORS.text, fontSize:"15px", fontFamily:"'Georgia',serif",
                lineHeight:"1.6", resize:"none", maxHeight:"160px", minHeight:"24px" }}
              placeholder="Ask anything…"
              value={input}
              rows={1}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onChange={e => { setInput(e.target.value); autoResize(e.target); }}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}/>
            <button
              style={{ width:"34px", height:"34px", borderRadius:"8px",
                background:COLORS.accent, border:"none",
                cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all .15s", flexShrink:0,
                opacity: !input.trim() || loading ? 0.4 : 1 }}
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M13 6l6 6-6 6"
                  stroke="#0d0d0d" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <div className="input-hint"
            style={{ fontSize:"11px", color:COLORS.textDim,
              marginTop:"8px", textAlign:"center", letterSpacing:"0.04em" }}>
            Enter to send · Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  );
}