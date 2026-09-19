import { useState, useRef, useEffect } from 'react';
import { Send, Phone, MapPin, Check, ShieldCheck, UserCheck, Search, Trash2 } from 'lucide-react';
import { Message, User } from '../types';
import { sendMessage, getMessages, clearChatMessagesForRide } from '../data/db';

interface ChatSystemProps {
  rideId: string;
  currentUser: User;
  partnerUser: { id: string; fullName: string; collegeName: string; avatarUrl: string; phoneNumber: string; role: string };
  onLocationShared?: (lat: number, lng: number) => void;
}

export default function ChatSystem({ rideId, currentUser, partnerUser, onLocationShared }: ChatSystemProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load chat history & refresh periodically to grab simulated bot replies
  useEffect(() => {
    const load = () => {
      const allMsgs = getMessages();
      const filtered = allMsgs.filter((m) => m.rideId === rideId);
      // Sort oldest to newest
      setMessages(filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
    };

    load();
    const interval = setInterval(load, 1500); // Poll fast for mock server simulator responses!
    return () => clearInterval(interval);
  }, [rideId]);

  // Scroll to bottom on updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (textToSend = inputText) => {
    if (!textToSend.trim()) return;
    sendMessage(rideId, currentUser.id, partnerUser.id, textToSend);
    setInputText('');
  };

  const handleShareLocation = () => {
    const lat = 12.8732 + (Math.random() - 0.5) * 0.05;
    const lng = 74.8454 + (Math.random() - 0.5) * 0.05;

    const messagesList = getMessages();
    const msg = sendMessage(rideId, currentUser.id, partnerUser.id, 'Shared live GPS coordinates 📍', {
      lat,
      lng,
      isRider: currentUser.role === 'rider',
    });

    if (onLocationShared) {
      onLocationShared(lat, lng);
    }
  };

  const startCallMock = () => {
    setIsCalling(true);
    setTimeout(() => {
      setIsCalling(false);
    }, 4500);
  };

  return (
    <div id="chat-system-layout" className="flex flex-col glass-panel rounded-2xl overflow-hidden h-[500px] shadow-2xl">
      {/* Chat header panel */}
      <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <img src={partnerUser.avatarUrl} alt={partnerUser.fullName} className="w-9 h-9 rounded-full object-cover border border-emerald-500" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-950 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-tight">
              <h4 className="text-xs font-bold text-white block">{partnerUser.fullName}</h4>
              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8px] uppercase tracking-wider px-1 py-0.5 rounded font-mono font-bold">
                {partnerUser.role}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 block truncate max-w-[170px]">{partnerUser.collegeName}</p>
          </div>
        </div>

         <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              clearChatMessagesForRide(rideId);
              setMessages([]);
            }}
            id="btn-clear-chat-partner"
            className="px-2 py-1 rounded-lg border border-red-900/30 bg-red-950/15 hover:bg-red-950/40 text-rose-400 hover:text-rose-300 transition cursor-pointer text-[10px] flex items-center gap-1 font-bold font-mono"
            title="Clear Chat History"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>

          <button
            onClick={startCallMock}
            id="btn-call-partner"
            className="p-1.5 rounded-lg border border-slate-750 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Voice Call"
          >
            <Phone className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleShareLocation}
            id="btn-share-coord-partner"
            className="p-1.5 rounded-lg border border-emerald-800/40 bg-emerald-950/20 hover:bg-emerald-950/50 text-emerald-400 transition cursor-pointer"
            title="Send Coordinates"
          >
            <MapPin className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calling Mock overlay */}
      {isCalling && (
        <div className="absolute inset-x-0 top-12 z-40 bg-slate-950/95 border-b border-slate-800 p-8 flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <img src={partnerUser.avatarUrl} alt="calling" className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500 animate-pulse" />
            <div className="absolute inset-0 bg-emerald-500/10 rounded-full animate-ping" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-bold text-white">Calling {partnerUser.fullName}...</h3>
            <p className="text-xs text-slate-400">Audio calling via CampusRide Secure Student Link</p>
          </div>
          <p className="font-mono text-[10px] text-emerald-400 shrink-0">Establishing end-to-end encryption</p>
        </div>
      )}

      {/* Message scroll stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#0F172A]">
        <div className="text-center py-2 shrink-0">
          <span className="bg-slate-950 border border-slate-800 text-[10px] text-slate-400 px-2.5 py-1 rounded-full font-medium tracking-tight inline-flex items-center gap-1.5 select-none">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Verified student messaging channel
          </span>
        </div>

        {messages.map((m) => {
          const isMe = m.senderId === currentUser.id;
          return (
            <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs ${
                  isMe
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-none'
                }`}
              >
                {m.text}

                {/* Shared gps coordinates card injection */}
                {m.locationShared && (
                  <div className="mt-2 p-2 bg-black/30 rounded-xl border border-white/10 flex flex-col gap-1.5 font-mono text-[10px] text-white">
                    <span className="font-bold flex items-center gap-1 text-emerald-400 uppercase tracking-widest text-[8px]">
                      <MapPin className="w-3 h-3" /> Live Location
                    </span>
                    <span>Lat: {m.locationShared.lat.toFixed(5)}</span>
                    <span>Lng: {m.locationShared.lng.toFixed(5)}</span>
                    <button
                      onClick={() => onLocationShared && onLocationShared(m.locationShared!.lat, m.locationShared!.lng)}
                      className="mt-1 bg-white/20 hover:bg-white/40 border border-white/10 px-2 py-0.5 rounded text-[8px] cursor-pointer text-center text-white"
                    >
                      Inspect Location pin
                    </button>
                  </div>
                )}
              </div>
              <span className="text-[9px] text-slate-500 font-mono mt-1 block">
                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {isMe && <Check className="w-3 h-3 text-emerald-400 ml-1 inline" />}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Suggested Chat helper tags */}
      <div className="px-3 py-1.5 bg-[#0F172A] border-t border-slate-800/60 flex gap-1.5 overflow-x-auto whitespace-nowrap shrink-0">
        {[
          'On my way!',
          'Outside St Aloysius gate',
          'I am running 5 minutes late',
          'Yellow helmet / Blue jacket',
          'Shared location, path tracker live',
        ].map((tag) => (
          <button
            key={tag}
            onClick={() => handleSend(tag)}
            className="text-[10px] border border-slate-800 hover:border-slate-750 bg-slate-950 text-slate-400 hover:text-white px-2 py-1 rounded-full cursor-pointer transition"
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Chat controls entry footer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="bg-slate-950 p-2.5 border-t border-slate-800 flex gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={handleShareLocation}
          id="btn-footer-share-loc"
          className="p-2 border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-450 hover:text-white rounded-xl transition cursor-pointer"
          title="Share Coordinates"
        >
          <MapPin className="w-4 h-4" />
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type message to synchronized..."
          id="chat-text-input-field"
          className="flex-1 bg-slate-900 border border-slate-800 text-white rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-emerald-500 placeholder-slate-500"
        />

        <button
          type="submit"
          id="btn-chat-submit"
          disabled={!inputText.trim()}
          className="bg-[#00C896] text-[#0f172a] hover:bg-emerald-400 p-2 rounded-xl transition disabled:opacity-40 disabled:hover:bg-[#00C896] cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
