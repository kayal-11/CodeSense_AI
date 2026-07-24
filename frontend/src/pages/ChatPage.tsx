import { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = configuredApiBase && configuredApiBase.length > 0 ? configuredApiBase.replace(/\/$/, '') : '/api';
const apiUrl = (path: string): string => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const ChatPage = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Ask me anything about this codebase.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessageContent = input.trim();
    setMessages((prev) => [...prev, { role: 'user', content: userMessageContent }]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post(apiUrl('/chat/'), { message: userMessageContent });
      const reply = response.data.reply;
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) {
      console.error('Error fetching chat response:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error connecting to the AI helper. Please make sure the backend is running.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">AI Chat</p>
        <h1 className="text-3xl font-semibold text-white">Conversation with your code review copilot</h1>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-glow"
      >
        <div className="h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                message.role === 'assistant'
                  ? 'bg-slate-800 text-slate-100'
                  : 'ml-auto bg-cyan-500/20 text-cyan-100 border border-cyan-500/20'
              }`}
            >
              {message.content}
            </div>
          ))}
          {loading && (
            <div className="max-w-[80%] rounded-2xl bg-slate-800 text-slate-400 px-4 py-3 text-sm italic flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce"></span>
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce delay-75"></span>
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce delay-150"></span>
              AI is thinking...
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-3">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSend()}
            placeholder="Ask about security, complexity, or bugs..."
            disabled={loading}
            className="flex-1 rounded-full border border-slate-700 bg-slate-950 px-6 py-3 text-sm text-slate-200 outline-none focus:border-cyan-500 transition"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className={`rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 active:scale-95 transition ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            Send
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ChatPage;

