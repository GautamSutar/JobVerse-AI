import { useEffect, useState, useRef } from 'react';
import { 
    Send, Hash, MessageSquare, Plus, 
    X, Phone, Video, PhoneOff, Mic, VideoOff,
    User as UserIcon
} from 'lucide-react';
import toast from 'react-hot-toast';
import { chatApi } from '../../services/chatApi';

export default function CommunityChat({ user }) {
    // activeChat format: { type: 'channel' | 'dm', id: number | string, name: string }
    const [activeChat, setActiveChat] = useState({ type: 'channel', id: 'general', name: 'general' });
    const [channels, setChannels] = useState([]);
    const [dmRooms, setDmRooms] = useState([]);
    const [people, setPeople] = useState([]);
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    
    // UI state
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('channels'); // channels | people
    
    // Admin state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newChannel, setNewChannel] = useState({ name: '', display_name: '', description: '' });

    // Calling state
    const [callState, setCallState] = useState({
        status: 'idle', // idle, dialing, ringing, connected
        isIncoming: false,
        callerId: null,
        callerName: '',
        type: 'video', // video, voice
    });
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const pcRef = useRef(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const ringtoneRef = useRef(new Audio('/assets/sounds/slack_ringtone.mp3'));
    const dialingRef = useRef(new Audio('/assets/sounds/slack_ringtone.mp3'));

    // Configure Audio
    useEffect(() => {
        ringtoneRef.current.loop = true;
        dialingRef.current.loop = true;
        return () => {
            ringtoneRef.current.pause();
            dialingRef.current.pause();
        };
    }, []);

    // Sync streams with video elements
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localVideoRef.current, localStream, callState.status]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteVideoRef.current, remoteStream, callState.status]);

    // Refs
    const wsRef = useRef(null);
    const bottomRef = useRef(null);

    // --- Data Loading ---
    useEffect(() => {
        loadSidebarData();
        const pollOnline = setInterval(loadOnlineUsers, 10000);
        return () => clearInterval(pollOnline);
    }, []);

    const loadSidebarData = async () => {
        try {
            const [chRes, dmRes, pplRes] = await Promise.all([
                chatApi.getChannels(),
                chatApi.getDMRooms(),
                chatApi.getUsers()
            ]);
            setChannels(chRes.data);
            setDmRooms(dmRes.data);
            setPeople(pplRes.data);
            
            // Set initial chat to the general channel's ID if available
            if (activeChat.id === 'general' && chRes.data.length > 0) {
                const gen = chRes.data.find(c => c.name === 'general') || chRes.data[0];
                setActiveChat({ type: 'channel', id: gen.id, name: gen.name });
            }
            await loadOnlineUsers();
        } catch (err) {
            console.error(err);
        }
    };

    const loadOnlineUsers = async () => {
        try {
            const res = await chatApi.getOnlineUsers();
            setOnlineUsers(new Set(res.data.map(o => o.user.id)));
        } catch {}
    };

    // --- Room / WebSocket Management ---
    useEffect(() => {
        if (!activeChat.id || activeChat.id === 'general') return;
        
        loadMessageHistory();
        connectWebSocket();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [activeChat.id]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadMessageHistory = async () => {
        setLoading(true);
        try {
            if (activeChat.type === 'channel') {
                const res = await chatApi.getChannelMessages(activeChat.id);
                setMessages(res.data);
            } else {
                const res = await chatApi.getDMMessages(activeChat.id);
                setMessages(res.data);
            }
        } catch {
            toast.error('Failed to load messages');
        } finally {
            setLoading(false);
        }
    };

    const connectWebSocket = () => {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        // Dynamic WebSocket URL
        const backendApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
        const backendHost = new URL(backendApiUrl).host;
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

        let wsUrl = '';
        if (activeChat.type === 'channel') {
            const ch = channels.find(c => c.id === activeChat.id);
            if (!ch) return;
            wsUrl = `${wsProtocol}//${backendHost}/ws/chat/channel/${ch.name}/?token=${token}`;
        } else {
            wsUrl = `${wsProtocol}//${backendHost}/ws/chat/dm/${activeChat.id}/?token=${token}`;
        }

        const ws = new WebSocket(wsUrl);

        ws.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'chat_message') {
                setMessages(prev => [...prev, data]);
            } else if (data.type === 'call_signal') {
                handleCallSignal(data);
            } else if (data.type === 'user_status') {
                setOnlineUsers(prev => {
                    const next = new Set(prev);
                    if (data.is_online) next.add(data.user_id);
                    else next.delete(data.user_id);
                    return next;
                });
            }
        };

        ws.onclose = () => {
            console.log('Chat disconnected');
        };

        wsRef.current = ws;
    };

    const handleCallSignal = async (data) => {
        const { signal, sender_id } = data;
        const isMe = sender_id === user.id;
        if (isMe) return;

        if (signal.type === 'offer') {
            setCallState({
                status: 'ringing',
                isIncoming: true,
                callerId: sender_id,
                callerName: signal.callerName || 'Unknown',
                type: signal.callType || 'video',
                offer: signal.offer
            });
            ringtoneRef.current.play().catch(console.error);
        } else if (signal.type === 'answer') {
            dialingRef.current.pause();
            dialingRef.current.currentTime = 0;
            if (pcRef.current) {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal.answer));
            }
        } else if (signal.type === 'ice') {
            if (pcRef.current) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        } else if (signal.type === 'hangup') {
            endCall(false);
        }
    };

    const startCall = async (type = 'video') => {
        setCallState({ status: 'dialing', isIncoming: false, callerId: null, callerName: activeChat.name, type });
        dialingRef.current.play().catch(console.error);
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: type === 'video', 
                audio: true 
            });
            setLocalStream(stream);
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            const pc = createPeerConnection(stream);
            pcRef.current = pc;

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const room = dmRooms.find(r => r.id === activeChat.id);
            const targetUserId = room?.other_user?.id;

            wsRef.current.send(JSON.stringify({
                type: 'call_signal',
                target_user_id: targetUserId,
                signal: {
                    type: 'offer',
                    offer,
                    callerName: user.first_name || user.username,
                    callType: type
                }
            }));
        } catch (err) {
            console.error(err);
            if (err.name === 'NotAllowedError') {
                toast.error('Permission denied. Please allow camera and mic access.');
            } else if (err.name === 'NotFoundError') {
                toast.error('No camera or microphone found to start the call.');
            } else {
                toast.error('Could not start call');
            }
            setCallState({ status: 'idle', isIncoming: false, callerId: null, callerName: '', type: 'video' });
        }
    };

    const acceptCall = async () => {
        ringtoneRef.current.pause();
        ringtoneRef.current.currentTime = 0;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: callState.type === 'video', 
                audio: true 
            });
            setLocalStream(stream);
            setCallState(prev => ({ ...prev, status: 'connected' }));

            const pc = createPeerConnection(stream);
            pcRef.current = pc;

            await pc.setRemoteDescription(new RTCSessionDescription(callState.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            wsRef.current.send(JSON.stringify({
                type: 'call_signal',
                target_user_id: callState.callerId,
                signal: { type: 'answer', answer }
            }));
        } catch (err) {
            console.error(err);
            if (err.name === 'NotAllowedError') {
                toast.error('Permission denied. Please allow camera and mic access.');
            } else if (err.name === 'NotFoundError') {
                toast.error('No camera or microphone found to accept the call.');
            } else {
                toast.error('Could not accept call');
            }
            endCall();
        }
    };

    const createPeerConnection = (stream) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (e) => {
            setRemoteStream(e.streams[0]);
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
            setCallState(prev => ({ ...prev, status: 'connected' }));
        };

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                const targetUserId = callState.isIncoming ? callState.callerId : dmRooms.find(r => r.id === activeChat.id)?.other_user?.id;
                wsRef.current.send(JSON.stringify({
                    type: 'call_signal',
                    target_user_id: targetUserId,
                    signal: { type: 'ice', candidate: e.candidate }
                }));
            }
        };

        return pc;
    };

    const endCall = (notify = true) => {
        ringtoneRef.current.pause();
        ringtoneRef.current.currentTime = 0;
        dialingRef.current.pause();
        dialingRef.current.currentTime = 0;

        if (notify && wsRef.current) {
            const targetUserId = callState.isIncoming ? callState.callerId : dmRooms.find(r => r.id === activeChat.id)?.other_user?.id;
            wsRef.current.send(JSON.stringify({
                type: 'call_signal',
                target_user_id: targetUserId,
                signal: { type: 'hangup' }
            }));
        }

        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }

        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }

        setRemoteStream(null);
        setCallState({ status: 'idle', isIncoming: false, callerId: null, callerName: '', type: 'video' });
    };

    const toggleMic = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) audioTrack.enabled = !audioTrack.enabled;
        }
    };

    const toggleVideo = () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) videoTrack.enabled = !videoTrack.enabled;
        }
    };

    const sendMessage = () => {
        if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        
        wsRef.current.send(JSON.stringify({
            type: 'chat_message',
            content: input
        }));
        
        setInput('');
    };

    const handleKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const openDM = async (otherUser) => {
        try {
            const res = await chatApi.createDMRoom(otherUser.id);
            const room = res.data;
            if (!dmRooms.find(r => r.id === room.id)) {
                setDmRooms([room, ...dmRooms]);
            }
            setActiveChat({ type: 'dm', id: room.id, name: otherUser.first_name || otherUser.username });
        } catch {
            toast.error('Could not open chat');
        }
    };

    const handleCreateChannel = async (e) => {
        e.preventDefault();
        if (!newChannel.name || !newChannel.display_name) return;
        try {
            const res = await chatApi.createChannel({
                ...newChannel,
                is_public: true
            });
            setChannels([...channels, res.data]);
            setShowCreateModal(false);
            setNewChannel({ name: '', display_name: '', description: '' });
            setActiveChat({ type: 'channel', id: res.data.id, name: res.data.name });
            toast.success('Channel created!');
        } catch {
            toast.error('Failed to create channel');
        }
    };

    return (
        <div className="relative flex h-[calc(100vh-8rem)] gap-6 font-sans">
            <style>{`
                @keyframes msgIn {
                    from { opacity: 0; transform: translateY(10px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .msg-anim {
                    animation: msgIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .custom-scroll::-webkit-scrollbar { width: 6px; }
                .custom-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
            `}</style>

            {/* Glowing Orbs for the whole component background */}
            <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none -z-10" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none -z-10" />

            {/* ── Sidebar ── */}
            <div className="w-72 flex-shrink-0 flex flex-col bg-[#0a0a0a]/60 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative z-10">
                <div className="flex border-b border-white/10 p-2 gap-2">
                    {['channels', 'people'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 ${
                                activeTab === tab 
                                    ? 'bg-indigo-600 shadow-[0_0_15px_rgba(99,102,241,0.4)] text-white' 
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}>
                            {tab === 'channels' ? 'Channels' : 'People'}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scroll space-y-4">
                    {activeTab === 'channels' ? (
                        <>
                            <div>
                                <div className="flex items-center justify-between px-2 mb-3">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Public Channels</span>
                                    {user?.role === 'ADMIN' && (
                                        <button onClick={() => setShowCreateModal(true)} className="w-6 h-6 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 hover:text-indigo-200 flex items-center justify-center transition-all">
                                            <Plus size={14} />
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    {channels.map(ch => {
                                        const active = activeChat.type === 'channel' && activeChat.id === ch.id;
                                        return (
                                            <button key={ch.id} onClick={() => setActiveChat({ type: 'channel', id: ch.id, name: ch.name })}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm transition-all duration-200 group ${
                                                    active 
                                                        ? 'bg-indigo-500/10 shadow-[inset_0_0_20px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/50 text-indigo-300 font-bold' 
                                                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                                }`}>
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                                    active ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'bg-white/5 group-hover:bg-white/10'
                                                }`}>
                                                    <Hash size={14} />
                                                </div>
                                                <span className="truncate flex-1 text-left">{ch.display_name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest px-2 mb-3 mt-6">Direct Messages</span>
                                <div className="space-y-1">
                                    {dmRooms.map(dm => {
                                        const other = dm.other_user; if (!other) return null;
                                        const isOnline = onlineUsers.has(other.id);
                                        const active = activeChat.type === 'dm' && activeChat.id === dm.id;
                                        return (
                                            <button key={dm.id} onClick={() => setActiveChat({ type: 'dm', id: dm.id, name: other.first_name || other.username })}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm transition-all duration-200 group ${
                                                    active 
                                                        ? 'bg-indigo-500/10 shadow-[inset_0_0_20px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/50 text-indigo-300 font-bold' 
                                                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                                }`}>
                                                <div className="relative flex-shrink-0">
                                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-black text-white transition-all ${
                                                        active ? 'bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30' : 'bg-white/10 group-hover:bg-white/20'
                                                    }`}>
                                                        {(other.first_name || other.username)[0].toUpperCase()}
                                                    </div>
                                                    {isOnline && <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#111] rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />}
                                                </div>
                                                <span className="truncate flex-1 text-left">{other.first_name || other.username}</span>
                                            </button>
                                        );
                                    })}
                                    {dmRooms.length === 0 && <p className="text-xs text-slate-500 italic px-2 py-2">No active DMs. Find connections in People.</p>}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div>
                            <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest px-2 mb-3">Directory</span>
                            <div className="space-y-1">
                                {people.map(p => {
                                    const isOnline = onlineUsers.has(p.id);
                                    return (
                                        <button key={p.id} onClick={() => openDM(p)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm transition-all hover:bg-white/5 group border border-transparent hover:border-white/10">
                                            <div className="relative flex-shrink-0">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-xs font-black text-indigo-300 group-hover:bg-indigo-500 group-hover:text-white transition-all shadow-[0_0_15px_rgba(99,102,241,0.1)] group-hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                                                    {(p.first_name || p.username)[0].toUpperCase()}
                                                </div>
                                                {isOnline && <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#111] rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />}
                                            </div>
                                            <div className="flex flex-col items-start flex-1 min-w-0">
                                                <span className="truncate text-slate-300 font-bold text-sm group-hover:text-white transition-colors">{p.first_name || p.username}</span>
                                                <span className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${p.role === 'STUDENT' ? 'text-indigo-400' : p.role === 'ALUMNI' ? 'text-emerald-400' : 'text-amber-400'}`}>{p.role}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Main Chat Area ── */}
            <div className="flex-1 flex flex-col bg-[#0a0a0a]/60 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative z-10">
                {/* Header */}
                <header className="h-20 px-8 border-b border-white/10 flex items-center justify-between flex-shrink-0 bg-white/5 backdrop-blur-3xl">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                            {activeChat.type === 'channel' ? <Hash size={24} /> : <UserIcon size={24} />}
                        </div>
                        <div>
                            <h2 className="text-white font-black text-xl tracking-tight flex items-center gap-2">
                                {activeChat.type === 'channel' ? '#' : ''}{activeChat.name}
                            </h2>
                            {activeChat.type === 'channel' && <p className="text-sm text-slate-400 font-medium">{channels.find(c => c.id === activeChat.id)?.description || 'Community Channel'}</p>}
                            {activeChat.type === 'dm' && (() => {
                                const isOnline = onlineUsers.has(dmRooms.find(r => r.id === activeChat.id)?.other_user?.id);
                                return <p className="text-sm flex items-center gap-2 font-bold"><span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-slate-600'}`} /><span className={isOnline ? 'text-emerald-400' : 'text-slate-500'}>{isOnline ? 'Online' : 'Offline'}</span></p>;
                            })()}
                        </div>
                    </div>
                    {activeChat.type === 'dm' && (
                        <div className="flex items-center gap-3">
                            <button onClick={() => startCall('voice')} title="Voice Call" className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/30 text-slate-400 hover:text-emerald-400 flex items-center justify-center transition-all hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]"><Phone size={20} /></button>
                            <button onClick={() => startCall('video')} title="Video Call" className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-indigo-500/20 border border-white/10 hover:border-indigo-500/30 text-slate-400 hover:text-indigo-400 flex items-center justify-center transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]"><Video size={20} /></button>
                        </div>
                    )}
                </header>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 custom-scroll">
                    {loading ? (
                        <div className="flex items-center justify-center h-full flex-col gap-4">
                            <div className="w-10 h-10 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                            <p className="text-sm font-bold text-slate-500 tracking-wider uppercase">Loading messages...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-5">
                            <div className="w-24 h-24 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.15)]"><MessageSquare size={40} className="text-indigo-400" /></div>
                            <div className="text-center">
                                <h3 className="text-white font-black text-2xl mb-2">It's quiet here.</h3>
                                <p className="text-slate-400 font-medium">Be the first to say hello and start the conversation! 👋</p>
                            </div>
                        </div>
                    ) : messages.map((m, idx) => {
                        const isMe = m.sender_id === user?.id;
                        const showHeader = idx === 0 || messages[idx - 1].sender_id !== m.sender_id;
                        return (
                            <div key={m.id || idx} className={`flex msg-anim ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex max-w-[75%] gap-4 ${isMe ? 'flex-row-reverse' : ''}`}>
                                    {!isMe && showHeader
                                        ? <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-lg">{(m.sender_name || '?')[0].toUpperCase()}</div>
                                        : !isMe ? <div className="w-10 flex-shrink-0" /> : null}
                                    
                                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                        {!isMe && showHeader && (
                                            <div className="flex items-baseline gap-2 mb-1.5 pl-1">
                                                <span className="text-sm font-black text-slate-200">{m.sender_name}</span>
                                                {m.sender_role && <span className={`text-[10px] font-black uppercase tracking-widest ${m.sender_role === 'STUDENT' ? 'text-indigo-400' : m.sender_role === 'ALUMNI' ? 'text-emerald-400' : 'text-amber-400'}`}>{m.sender_role}</span>}
                                            </div>
                                        )}
                                        <div className={`px-6 py-3.5 text-base leading-relaxed break-words shadow-xl ${
                                            isMe 
                                                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-3xl rounded-tr-sm shadow-[0_5px_20px_rgba(99,102,241,0.3)]' 
                                                : 'bg-white/5 border border-white/10 backdrop-blur-md text-slate-100 rounded-3xl rounded-tl-sm shadow-[0_5px_20px_rgba(0,0,0,0.2)]'
                                        }`}>
                                            {m.content}
                                        </div>
                                        <span className={`text-xs font-bold text-slate-500 mt-2 ${isMe ? 'pr-2' : 'pl-2'}`}>
                                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={bottomRef} />
                </div>

                {/* Modern Input */}
                <div className="p-6 bg-black/40 backdrop-blur-3xl border-t border-white/10">
                    <div className="flex items-end gap-4 max-w-4xl mx-auto relative group">
                        <textarea 
                            className="flex-1 bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 focus:border-indigo-500/50 rounded-3xl px-6 py-4 text-base text-white placeholder:text-slate-500 outline-none transition-all duration-300 resize-none min-h-[56px] max-h-32 custom-scroll shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)] focus:shadow-[inset_0_2px_10px_rgba(0,0,0,0.2),0_0_20px_rgba(99,102,241,0.15)]"
                            value={input} 
                            onChange={e => setInput(e.target.value)} 
                            onKeyDown={handleKey}
                            rows={1}
                            placeholder={`Message ${activeChat.type === 'channel' ? '#' : ''}${activeChat.name}...`}
                        />
                        <button onClick={sendMessage} disabled={!input.trim()}
                            className="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:bg-white/10 disabled:shadow-none text-white flex items-center justify-center transition-all duration-300 flex-shrink-0 shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] hover:scale-105 active:scale-95">
                            <Send size={20} className={input.trim() ? 'translate-x-0.5 -translate-y-0.5' : ''} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Create Channel Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4">
                    <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-lg shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden">
                        <div className="flex items-center justify-between p-8 border-b border-white/5 bg-gradient-to-r from-indigo-500/5 to-transparent">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                                    <Hash size={24} className="text-indigo-400" />
                                </div>
                                <h3 className="text-2xl font-black text-white">Create Channel</h3>
                            </div>
                            <button onClick={() => setShowCreateModal(false)} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateChannel} className="p-8 space-y-6">
                            {[{ label: 'Channel Slug (e.g. general-chat)', field: 'name', placeholder: 'tech-talks', mono: true }, { label: 'Display Name', field: 'display_name', placeholder: 'Tech Talks', mono: false }].map(({ label, field, placeholder, mono }) => (
                                <div key={field}>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</label>
                                    <input required placeholder={placeholder} className={`w-full px-5 py-4 bg-white/5 border border-white/10 focus:border-indigo-500/50 focus:bg-indigo-500/5 focus:shadow-[0_0_20px_rgba(99,102,241,0.15)] rounded-2xl text-white text-base outline-none transition-all ${mono ? 'font-mono' : ''}`}
                                        value={newChannel[field]} onChange={e => setNewChannel({ ...newChannel, [field]: field === 'name' ? e.target.value.toLowerCase().replace(/\s+/g, '-') : e.target.value })} />
                                </div>
                            ))}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Description</label>
                                <textarea className="w-full px-5 py-4 bg-white/5 border border-white/10 focus:border-indigo-500/50 focus:bg-indigo-500/5 focus:shadow-[0_0_20px_rgba(99,102,241,0.15)] rounded-2xl text-white text-base outline-none transition-all resize-none min-h-[100px]"
                                    placeholder="What is the purpose of this channel?" value={newChannel.description} onChange={e => setNewChannel({ ...newChannel, description: e.target.value })} />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 font-bold text-base transition-all">Cancel</button>
                                <button type="submit" disabled={!newChannel.name || !newChannel.display_name} className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 text-white font-black text-base transition-all shadow-[0_0_30px_rgba(99,102,241,0.4)]">Create Channel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Premium Call Overlay */}
            {callState.status !== 'idle' && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-3xl flex flex-col items-center justify-center p-8">
                    {callState.status === 'connected' ? (
                        <div className="relative w-full h-full max-w-6xl bg-[#050505] rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col">
                            <div className="relative flex-1 bg-black flex items-center justify-center">
                                {callState.type === 'video' ? (
                                    <>
                                        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                                        <div className="absolute bottom-6 right-6 w-64 aspect-video bg-black rounded-3xl overflow-hidden border border-white/20 shadow-[0_0_40px_rgba(0,0,0,0.8)] z-10">
                                            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center gap-8 relative">
                                        <div className="absolute inset-0 bg-indigo-500/10 blur-[100px] rounded-full" />
                                        <div className="w-40 h-40 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-6xl font-black text-white shadow-[0_0_60px_rgba(99,102,241,0.5)] animate-pulse relative z-10">
                                            {callState.callerName[0]?.toUpperCase()}
                                        </div>
                                        <div className="text-center relative z-10">
                                            <h2 className="text-3xl font-black text-white mb-2">{callState.callerName}</h2>
                                            <p className="text-indigo-400 font-bold tracking-widest uppercase">Secure Voice Connected</p>
                                        </div>
                                        <video ref={remoteVideoRef} autoPlay playsInline className="hidden" /><video ref={localVideoRef} autoPlay playsInline muted className="hidden" />
                                    </div>
                                )}
                            </div>
                            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center justify-center gap-6 bg-white/10 backdrop-blur-xl border border-white/20 px-10 py-5 rounded-full shadow-[0_0_40px_rgba(0,0,0,0.5)]">
                                <button onClick={toggleMic} className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center border border-white/10 transition-all hover:scale-110"><Mic size={24} /></button>
                                {callState.type === 'video' && <button onClick={toggleVideo} className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center border border-white/10 transition-all hover:scale-110"><Video size={24} /></button>}
                                <button onClick={() => endCall()} className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-all hover:scale-110"><PhoneOff size={28} /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full max-w-md bg-[#0a0a0a]/80 backdrop-blur-2xl border border-white/10 rounded-[3rem] p-12 shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col items-center text-center">
                            <div className="relative mb-12">
                                <div className="absolute inset-0 bg-indigo-500/30 rounded-full animate-ping shadow-[0_0_50px_rgba(99,102,241,0.5)]" />
                                <div className="absolute -inset-4 border border-indigo-500/30 rounded-full animate-pulse" />
                                <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-5xl font-black text-white shadow-[0_0_40px_rgba(99,102,241,0.6)]">
                                    {callState.callerName[0]?.toUpperCase() || '?'}
                                </div>
                            </div>
                            <h2 className="text-3xl font-black text-white mb-3">{callState.callerName}</h2>
                            <p className="text-indigo-400 font-bold uppercase tracking-widest mb-12 text-sm">
                                {callState.status === 'dialing' ? 'Dialing...' : callState.isIncoming ? `Incoming ${callState.type} call` : 'Ringing...'}
                            </p>
                            <div className="flex gap-6 w-full justify-center">
                                {callState.isIncoming && callState.status === 'ringing' ? (
                                    <>
                                        <button onClick={acceptCall} className="w-20 h-20 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-all shadow-[0_0_40px_rgba(16,185,129,0.4)] hover:scale-110"><Phone size={32} /></button>
                                        <button onClick={() => endCall()} className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-all shadow-[0_0_40px_rgba(239,68,68,0.4)] hover:scale-110"><PhoneOff size={32} /></button>
                                    </>
                                ) : (
                                    <button onClick={() => endCall()} className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-all shadow-[0_0_40px_rgba(239,68,68,0.4)] hover:scale-110"><X size={32} /></button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
