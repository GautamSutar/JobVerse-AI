import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import { AlertCircle, Clock, Bot, Send, Square, Volume2, Mic, Maximize, AlertTriangle, CameraOff, XCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import CodingEnvironment from '../components/CodingEnvironment';
import ProctoringMonitor from '../components/proctoring/ProctoringMonitor';
import Vapi from '@vapi-ai/web';

const MAX_QUESTIONS = 25; // As per the requirement

const InterviewSession = ({ user }) => {
    const { id: scheduleId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const resumeId = location.state?.resumeId;

    const [interviewData, setInterviewData] = useState(null);
    const [currentQuestionText, setCurrentQuestionText] = useState('');
    const [questionCount, setQuestionCount] = useState(1);
    const [answer, setAnswer] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [isCoding, setIsCoding] = useState(false);

    // Proctoring & Status
    const [timeLeft, setTimeLeft] = useState(300); // 5 mins per question
    const [isFinished, setIsFinished] = useState(false);
    const [isDisqualified, setIsDisqualified] = useState(false);
    const [finalScore, setFinalScore] = useState(null);
    
    // Web Speech API / Vapi
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const vapiRef = useRef(null);
    const vapiActiveRef = useRef(false);
    const pendingSpeechRef = useRef(null);

    // Advanced Proctoring State
    const [warnings, setWarnings] = useState(0);
    const [tabSwitches, setTabSwitches] = useState(0);
    const [screenshotWarnings, setScreenshotWarnings] = useState(0);
    const [showEscWarningDialog, setShowEscWarningDialog] = useState(false);
    const [showTabWarningDialog, setShowTabWarningDialog] = useState(false);
    const [showScreenshotWarningDialog, setShowScreenshotWarningDialog] = useState(false);
    const [proctoringLogs, setProctoringLogs] = useState([]);
    const [severeViolationMsg, setSevereViolationMsg] = useState(null);

    const warningsRef = useRef(0);
    const tabSwitchesRef = useRef(0);
    const screenshotWarningsRef = useRef(0);
    const intentionalExitRef = useRef(false);
    const proctoringLogsRef = useRef([]);
    const fullscreenListenerRef = useRef(null);
    const visibilityListenerRef = useRef(null);

    const totalViolations = warnings + tabSwitches + screenshotWarnings;

    useEffect(() => { warningsRef.current = warnings; }, [warnings]);
    useEffect(() => { tabSwitchesRef.current = tabSwitches; }, [tabSwitches]);
    useEffect(() => { screenshotWarningsRef.current = screenshotWarnings; }, [screenshotWarnings]);

    const hasInitialized = useRef(false);

    useEffect(() => {
        // Initialize Vapi Instance
        vapiRef.current = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY);
        vapiRef.current.on('call-start', () => {
            console.log("Vapi Call Started");
            vapiActiveRef.current = true;
            // Mute the Vapi microphone so it doesn't process candidate speech
            vapiRef.current.setMuted(true);
            if (pendingSpeechRef.current) {
                speakText(pendingSpeechRef.current);
                pendingSpeechRef.current = null;
            }
        });
        vapiRef.current.on('call-end', () => {
            vapiActiveRef.current = false;
        });
        vapiRef.current.on('error', (e) => {
            console.error("Vapi Error:", e);
        });

        if (!hasInitialized.current) {
            hasInitialized.current = true;
            initializeInterview();
            initSpeechRecognition();
            setupProctoringListeners();
        }

        return () => {
            window.speechSynthesis?.cancel(); // Stop fallback
            if (vapiRef.current) {
                vapiRef.current.stop();
            }
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            
            // Cleanup proctoring listeners
            if (fullscreenListenerRef.current) document.removeEventListener('fullscreenchange', fullscreenListenerRef.current);
            if (visibilityListenerRef.current) document.removeEventListener('visibilitychange', visibilityListenerRef.current);
            if (window._cleanupKeyDown) document.removeEventListener('keydown', window._cleanupKeyDown);
            if (window._cleanupKeyUp) document.removeEventListener('keyup', window._cleanupKeyUp);
            if (window._cleanupBlur) window.removeEventListener('blur', window._cleanupBlur);
            document.body.classList.remove('hide-dashboard-sidebar');

            if (document.fullscreenElement && !isFinished) {
                document.exitFullscreen().catch(err => console.log(err));
            }
        };
    }, []);

    useEffect(() => {
        if (timeLeft > 0 && !isFinished && !loading) {
            const id = setInterval(() => setTimeLeft(p => p - 1), 1000);
            return () => clearInterval(id);
        } else if (timeLeft === 0 && !isFinished && !loading) {
            if (!isCoding) {
                handleSubmitAnswer();
            }
        }
    }, [timeLeft, isFinished, loading, isCoding]);

    const addProctoringLog = (type, message, severity) => {
        const logEntry = { type, message, severity, timestamp: new Date().toISOString() };
        proctoringLogsRef.current = [...proctoringLogsRef.current, logEntry];
        setProctoringLogs(proctoringLogsRef.current);
        
        api.post('/interviews/proctoring/violation/', { test_id: scheduleId, violation_type: type }).catch(() => {});

        if (severity === 'severe') {
            setSevereViolationMsg(message);
            setIsDisqualified(true);
            endInterview();
        }
    };

    const setupProctoringListeners = () => {
        const triggerScreenshotWarning = () => {
            if (intentionalExitRef.current) return;
            const newWarnings = screenshotWarningsRef.current + 1;
            screenshotWarningsRef.current = newWarnings;
            setScreenshotWarnings(newWarnings);
            addProctoringLog('screenshot_attempt', 'Attempted to take a screenshot.', 'warning');
            setShowScreenshotWarningDialog(true);
        };

        const handleKeyDown = (e) => {
            const isMacScreenshot = e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key);
            const isPrint = (e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P');
            const isWindowsSnippet = e.metaKey && e.shiftKey && (e.key === 's' || e.key === 'S');
            if (isMacScreenshot || isPrint || isWindowsSnippet) { e.preventDefault(); triggerScreenshotWarning(); }
        };
        
        const handleKeyUp = (e) => {
            if (e.key === 'PrintScreen') { e.preventDefault(); triggerScreenshotWarning(); }
            if (e.key === 's' || e.key === 'S' || e.key === 'Meta' || e.key === 'Shift') {
                if ((e.metaKey && e.shiftKey) || (e.key === 's' && e.metaKey && e.shiftKey)) {
                     triggerScreenshotWarning();
                }
            }
        };

        const handleBlur = () => {
            if (!isFinished && document.fullscreenElement) {
                 setTimeout(() => {
                     if (!document.hidden && document.activeElement === document.body) {
                        triggerScreenshotWarning();
                     }
                 }, 150);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);
        
        window._cleanupKeyDown = handleKeyDown;
        window._cleanupKeyUp = handleKeyUp;
        window._cleanupBlur = handleBlur;

        const handleFullscreenChange = () => {
            if (!document.fullscreenElement && !isFinished) {
                if (intentionalExitRef.current) {
                    intentionalExitRef.current = false;
                    return;
                }
                const newWarnings = warningsRef.current + 1;
                warningsRef.current = newWarnings;
                setWarnings(newWarnings);
                addProctoringLog('fullscreen_exit', 'Exited fullscreen mode.', 'warning');
                setShowEscWarningDialog(true);
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        fullscreenListenerRef.current = handleFullscreenChange;

        const handleVisibilityChange = () => {
            if (document.hidden && !isFinished) {
                if (intentionalExitRef.current) return;
                const newSwitches = tabSwitchesRef.current + 1;
                tabSwitchesRef.current = newSwitches;
                setTabSwitches(newSwitches);
                addProctoringLog('tab_switch', 'Switched to a different tab or application.', 'warning');
                setShowTabWarningDialog(true);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        visibilityListenerRef.current = handleVisibilityChange;

        document.body.classList.add('hide-dashboard-sidebar');
    };

    const enterFullscreen = () => {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        }
    };

    const initSpeechRecognition = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.onresult = (event) => {
                let currentTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        setAnswer(prev => prev + transcript + ' ');
                    } else {
                        currentTranscript += transcript;
                    }
                }
            };
            recognitionRef.current.onerror = (event) => {
                console.error('Speech recognition error', event.error);
                setIsListening(false);
            };
        } else {
            console.warn("Speech Recognition API not supported in this browser.");
        }
    };

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            recognitionRef.current?.start();
            setIsListening(true);
        }
    };

    const fallbackTTS = (text) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Natural')) || voices[0];
            if (preferredVoice) utterance.voice = preferredVoice;
            window.speechSynthesis.speak(utterance);
        }
    };

    const speakText = (text) => {
        if (vapiRef.current) {
            if (vapiActiveRef.current) {
                try {
                    vapiRef.current.send({
                        type: "add-message",
                        message: {
                            role: "system",
                            content: `Read the following text exactly: ${text}`
                        }
                    });
                } catch (err) {
                    console.error("Vapi speak error", err);
                    fallbackTTS(text);
                }
            } else {
                pendingSpeechRef.current = text;
                // Fallback to browser TTS if Vapi takes more than 5 seconds to connect
                setTimeout(() => {
                    if (pendingSpeechRef.current === text && !vapiActiveRef.current) {
                        fallbackTTS(text);
                        pendingSpeechRef.current = null;
                    }
                }, 5000);
            }
        } else {
            fallbackTTS(text);
        }
    };

    const initializeInterview = async () => {
        try {
            setLoading(true);
            
            // Start Vapi Call in background
            if (vapiRef.current) {
                vapiRef.current.start({
                    model: {
                        provider: "openai",
                        model: "gpt-3.5-turbo",
                        messages: [{ role: "system", content: "You are an AI interviewer. Read text provided to you directly. Do not converse." }]
                    },
                    voice: { provider: "11labs", voiceId: "bIHbv24MWmeRgasZH58o" },
                    firstMessage: "Welcome to JobVerse AI. Your interview environment is ready.",
                }).catch(e => console.error("Failed to start Vapi", e));
            }

            const scheduleRes = await api.get(`/interviews/schedules/${scheduleId}/`);
            if (scheduleRes.data.status === 'COMPLETED') {
                setFinalScore(scheduleRes.data.final_score);
                setIsFinished(true);
                return;
            }

            setInterviewData(scheduleRes.data);

            const attemptRes = await api.get('/interviews/interview-attempts/');
            const thisAttempts = attemptRes.data.filter(a => a.interview === parseInt(scheduleId));

            if (thisAttempts.length >= MAX_QUESTIONS) {
                await endInterview();
                return;
            }

            if (thisAttempts.length === 0) {
                const res = await api.post(`/interviews/schedules/${scheduleId}/start/`, { resume_id: resumeId });
                setCurrentQuestionText(res.data.question);
                speakText(res.data.question);
            } else {
                const res = await api.post(`/interviews/schedules/${scheduleId}/start/`, { resume_id: resumeId });
                setCurrentQuestionText("Let's continue: " + res.data.question);
                speakText("Let's continue. " + res.data.question);
                setQuestionCount(thisAttempts.length + 1);
                
                // Set isCoding if we are in the last few questions
                if (thisAttempts.length + 1 > MAX_QUESTIONS - 3) {
                    setIsCoding(true);
                }
            }
        } catch (err) {
            console.error(err);
            toast.error('Failed to initialize AI Interview.');
        } finally {
            setLoading(false);
        }
    };

    const endInterview = async () => {
        if (isFinished) return;
        try {
            setLoading(true);
            if (vapiRef.current) {
                vapiRef.current.stop();
            }
            intentionalExitRef.current = true;
            if (document.fullscreenElement) {
                await document.exitFullscreen().catch(e => {});
            }
            const res = await api.post(`/interviews/schedules/${scheduleId}/end/`);
            setFinalScore(res.data.score);
            setIsFinished(true);
            toast.success("Interview completed! Generating final report...");
        } catch (err) {
            toast.error("Failed to finalize interview");
        } finally {
            setLoading(false);
        }
    };

    const handleCodingComplete = async (result) => {
        setSubmitting(false);
        if (questionCount >= MAX_QUESTIONS) {
            await endInterview();
        } else {
            setQuestionCount(prev => prev + 1);
            toast.success("Moving to next assessment...");
            try {
                const res = await api.post(`/interviews/schedules/${scheduleId}/submit-answer/`, {
                    question: "Coding Completed: " + currentQuestionText,
                    answer: "Code submitted and evaluated.",
                    question_count: questionCount,
                    max_questions: MAX_QUESTIONS
                });
                setCurrentQuestionText(res.data.next_question);
                setIsCoding(res.data.is_coding);
                speakText(res.data.next_question);
                setTimeLeft(600); // 10 mins for code
            } catch (e) {
                await endInterview();
            }
        }
    };

    const handleSubmitAnswer = async (e) => {
        if (e) e.preventDefault();
        if (submitting || isFinished) return;

        window.speechSynthesis?.cancel();
        if (isListening) toggleListening();
        
        setSubmitting(true);
        const submittedAnswer = answer || 'Candidate provided no string answer.';
        setAnswer('');

        toast("AI evaluates your answer...", { icon: '🤖' });

        try {
            const res = await api.post(`/interviews/schedules/${scheduleId}/submit-answer/`, {
                question: currentQuestionText,
                answer: submittedAnswer,
                question_count: questionCount,
                max_questions: MAX_QUESTIONS
            });

            if (questionCount >= MAX_QUESTIONS) {
                await endInterview();
            } else {
                setQuestionCount(prev => prev + 1);
                setCurrentQuestionText(res.data.next_question);
                setIsCoding(res.data.is_coding);
                speakText(res.data.next_question);
                setTimeLeft(res.data.is_coding ? 600 : 300); 
            }
        } catch (err) {
            toast.error('Failed to submit answer.');
        } finally {
            setSubmitting(false);
        }
    };

    const dismissEscWarning = async () => {
        setShowEscWarningDialog(false);
        if (totalViolations >= 3) {
            await endInterview();
        } else {
            try {
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                }
            } catch (e) {
                console.log('Failed to re-enter fullscreen:', e);
            }
        }
    };

    const dismissTabWarning = async () => {
        setShowTabWarningDialog(false);
        if (totalViolations >= 3) {
            await endInterview();
        }
    };

    const dismissScreenshotWarning = async () => {
        setShowScreenshotWarningDialog(false);
        if (totalViolations >= 3) {
            await endInterview();
        }
    };

    const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-50 animate-pulse" />
                <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin relative z-10" />
            </div>
            <div className="text-center">
                <p className="text-white font-black text-xl mb-2">JobVerse AI is initializing your secure environment...</p>
                <p className="text-slate-400 font-medium">Loading Face Detection Models & Audio Context</p>
            </div>
        </div>
    );

    if (isDisqualified) return (
        <div className="max-w-3xl mx-auto my-12 text-center relative z-10">
            <div className="bg-[#0a0a0a]/80 backdrop-blur-xl p-12 border border-red-500/30 rounded-3xl shadow-[0_0_80px_rgba(239,68,68,0.2)]">
                <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-8 border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
                    <AlertTriangle className="text-red-500" size={48} />
                </div>
                <h2 className="text-4xl font-black text-red-400 mb-4">Interview Terminated</h2>
                <p className="text-slate-300 text-lg mb-8 max-w-xl mx-auto leading-relaxed">
                    Your session was automatically terminated due to a severe academic integrity violation: 
                </p>

                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 mb-10 max-w-md mx-auto">
                    <p className="text-red-400 font-bold text-xl">{severeViolationMsg || "Proctoring rules violated."}</p>
                </div>

                <p className="text-slate-500 mb-10 font-medium">This incident has been recorded and HR has been notified.</p>

                <button onClick={() => navigate('/student/dashboard')} className="px-10 py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all font-black text-lg hover:scale-105">
                    Return to Dashboard
                </button>
            </div>
        </div>
    );

    if (isFinished) return (
        <div className="max-w-3xl mx-auto my-12 text-center relative z-10">
            <div className="bg-[#0a0a0a]/80 backdrop-blur-xl p-12 border border-white/10 rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.5)]">
                <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-8 border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                    <CheckCircle className="text-emerald-400" size={48} />
                </div>
                <h2 className="text-4xl font-black text-white mb-4">Interview Completed!</h2>
                <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto leading-relaxed">The JobVerse AI Interview Engine has successfully recorded and evaluated your responses across all questions.</p>

                <div className="bg-white/5 border border-white/10 rounded-3xl p-10 mb-10 max-w-md mx-auto relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10" />
                    <p className="text-indigo-400 text-sm font-black uppercase tracking-widest mb-4 relative z-10">Final AI Score</p>
                    <p className="text-7xl font-black text-white relative z-10">{finalScore !== null ? Math.round(finalScore) : '--'}<span className="text-indigo-400 text-4xl">%</span></p>
                </div>

                <p className="text-slate-500 mb-10 font-medium">HR has been notified of your completion and will review your detailed AI analysis report.</p>

                <button onClick={() => navigate('/student/dashboard')} className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] transition-all font-black text-lg hover:scale-105">
                    Return to Dashboard
                </button>
            </div>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto my-6 px-4 pb-20 select-none relative z-10"
             onCopy={(e) => { e.preventDefault(); addProctoringLog('copy_attempt', 'Attempted to copy test content.', 'warning'); toast.error("Copying text is not allowed."); }}
             onCut={(e) => { e.preventDefault(); addProctoringLog('cut_attempt', 'Attempted to cut test content.', 'warning'); toast.error("Cutting text is not allowed."); }}
             onPaste={(e) => { e.preventDefault(); addProctoringLog('paste_attempt', 'Attempted to paste content.', 'warning'); toast.error("Pasting text is not allowed."); }}
             onContextMenu={(e) => { e.preventDefault(); addProctoringLog('right_click', 'Attempted to use context menu.', 'warning'); toast.error("Right-click is disabled."); }}>
            <div className="bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-8 flex justify-between items-center shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                        <Bot className="text-indigo-400" size={28} />
                    </div>
                    <div>
                        <h1 className="font-black text-2xl text-white tracking-tight">JobVerse AI Interview</h1>
                        <p className="text-sm font-medium text-slate-400 mt-1 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Proctored Session | Do not look away or switch tabs
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button onClick={enterFullscreen} className="px-4 py-2.5 rounded-xl font-bold text-sm bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all flex items-center gap-2">
                        <Maximize size={16} /> Fullscreen
                    </button>
                    <div className={`flex items-center gap-3 px-5 py-2.5 rounded-xl font-mono font-black text-lg border transition-all ${timeLeft <= 60 ? 'bg-red-500/10 border-red-500/30 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 shadow-[0_0_20px_rgba(99,102,241,0.2)]'}`}>
                        <Clock size={20} />{formatTime(timeLeft)}
                    </div>
                    <button onClick={() => { if (window.confirm('Are you sure you want to end? Your score will be calculated based on current progress.')) endInterview(); }} className="px-4 py-2.5 rounded-xl font-bold text-sm bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all flex items-center gap-2">
                        <Square size={16} /> End Early
                    </button>
                </div>
            </div>

            <div className="bg-[#0a0a0a]/80 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden mb-6 shadow-2xl relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
                <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/20 p-8 border-b border-white/10 flex gap-6 items-start relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
                    <div className="mt-1 flex-shrink-0 w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                        <Volume2 size={24} className={isListening ? "animate-pulse text-indigo-400" : ""} />
                    </div>
                    <div className="relative z-10">
                        <div className="text-indigo-400 text-sm font-black tracking-widest uppercase mb-3 flex items-center gap-3">
                            <span>Question {questionCount} <span className="text-slate-500">/ {MAX_QUESTIONS}</span></span>
                            {isCoding && <span className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 text-xs">Coding Assessment</span>}
                        </div>
                        <p className="text-2xl font-semibold text-white leading-relaxed">{currentQuestionText}</p>
                    </div>
                </div>

                {!isCoding ? (
                    <div className="p-8 bg-black/40">
                        <form onSubmit={handleSubmitAnswer}>
                            <div className="flex justify-between items-center mb-4">
                                <label className="font-bold text-slate-300 flex items-center gap-3 text-lg">
                                    <Mic size={20} className={isListening ? "text-red-400 animate-pulse" : "text-slate-500"} /> 
                                    Your Response
                                </label>
                                <button 
                                    type="button" 
                                    onClick={toggleListening}
                                    className={`text-sm font-bold px-4 py-2 rounded-xl border transition-all ${isListening ? 'bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
                                >
                                    {isListening ? 'Stop Mic' : 'Start Mic (Speech-to-Text)'}
                                </button>
                            </div>
                            <div className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-20 group-focus-within:opacity-50 transition duration-500"></div>
                                <textarea
                                    autoFocus
                                    required
                                    className="relative w-full min-h-[250px] p-6 bg-[#0a0a0a] border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500 resize-y text-white text-xl leading-relaxed placeholder-slate-600 transition-all custom-scrollbar"
                                    placeholder="Speak into the microphone or type your technical answer here..."
                                    value={answer}
                                    onChange={e => setAnswer(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-end mt-6">
                                <button type="submit" disabled={submitting || !answer.trim()} className={`px-10 py-4 rounded-2xl font-black text-lg transition-all flex items-center gap-3 ${submitting || !answer.trim() ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/10' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:scale-105 text-white shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_40px_rgba(99,102,241,0.6)]'}`}>
                                    {submitting ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={20} />}
                                    {submitting ? 'Evaluating...' : 'Submit Answer'}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="p-8 bg-black/40">
                        <CodingEnvironment 
                            scheduleId={scheduleId} 
                            questionText={currentQuestionText} 
                            onComplete={handleCodingComplete}
                            submittingCode={submitting}
                            setSubmittingCode={setSubmitting}
                        />
                    </div>
                )}
            </div>

            {/* Proctoring UI Overlay */}
            {!isFinished && (
                <ProctoringMonitor
                    testId={scheduleId}
                    onViolation={(violation) => {
                        addProctoringLog(violation.type, violation.msg, violation.severity);
                        if (violation.severity !== 'severe') {
                            toast.error(`Warning: ${violation.msg}`, { duration: 5000 });
                        }
                    }}
                />
            )}

            {/* Warning Modals */}
            {showEscWarningDialog && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="absolute inset-0 bg-red-950/80 backdrop-blur-md" />
                    <div className="relative bg-[#0a0a0a] border-2 border-red-500/50 rounded-3xl shadow-[0_0_100px_rgba(239,68,68,0.4)] p-10 max-w-lg w-full mx-4 text-center animate-[fadeIn_0.2s_ease]">
                        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
                            <XCircle className="text-red-500" size={40} />
                        </div>
                        {totalViolations >= 3 ? (
                            <>
                                <h2 className="text-3xl font-black text-red-400 mb-4">Interview Terminated!</h2>
                                <p className="text-slate-300 text-lg leading-relaxed mb-8">
                                    You exceeded the maximum limit of <span className="text-red-400 font-bold">3 violations</span>. Your interview has been automatically ended.
                                </p>
                            </>
                        ) : (
                            <>
                                <h2 className="text-2xl font-black text-amber-400 mb-3">⚠ Fullscreen Violation</h2>
                                <p className="text-slate-300 text-base leading-relaxed mb-6">
                                    Exiting full-screen is <span className="text-red-400 font-bold">strictly prohibited</span>. You will be returned to the secure environment immediately.
                                </p>
                                <div className="mb-8 inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-red-500/10 border border-red-500/30">
                                    <span className="text-red-400 font-black">Warning {totalViolations} / 3</span>
                                </div>
                            </>
                        )}
                        <button onClick={dismissEscWarning} className={`w-full py-4 rounded-xl font-black text-white text-lg transition-all ${totalViolations >= 3 ? 'bg-red-600 hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]'}`}>
                            {totalViolations >= 3 ? 'View Results' : 'Return to Full-Screen'}
                        </button>
                    </div>
                </div>
            )}

            {showTabWarningDialog && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="absolute inset-0 bg-amber-950/80 backdrop-blur-md" />
                    <div className="relative bg-[#0a0a0a] border-2 border-amber-500/50 rounded-3xl shadow-[0_0_100px_rgba(245,158,11,0.4)] p-10 max-w-lg w-full mx-4 text-center animate-[fadeIn_0.2s_ease]">
                        <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                            <AlertTriangle className="text-amber-400" size={40} />
                        </div>
                        {totalViolations >= 3 ? (
                            <>
                                <h2 className="text-3xl font-black text-red-400 mb-4">Interview Terminated!</h2>
                                <p className="text-slate-300 text-lg leading-relaxed mb-8">
                                    You exceeded the maximum limit of <span className="text-red-400 font-bold">3 violations</span>. Your interview has been automatically ended.
                                </p>
                            </>
                        ) : (
                            <>
                                <h2 className="text-2xl font-black text-amber-400 mb-3">⚠ Focus Violation</h2>
                                <p className="text-slate-300 text-base leading-relaxed mb-6">
                                    Switching tabs or applications is <span className="text-amber-500 font-bold">prohibited</span>. Maintain focus on the interview window.
                                </p>
                                <div className="mb-8 inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                                    <span className="text-amber-400 font-black">Warning {totalViolations} / 3</span>
                                </div>
                            </>
                        )}
                        <button onClick={dismissTabWarning} className={`w-full py-4 rounded-xl font-black text-white text-lg transition-all ${totalViolations >= 3 ? 'bg-red-600 hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]'}`}>
                            {totalViolations >= 3 ? 'View Results' : 'Return to Interview'}
                        </button>
                    </div>
                </div>
            )}

            {showScreenshotWarningDialog && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="absolute inset-0 bg-red-950/80 backdrop-blur-md" />
                    <div className="relative bg-[#0a0a0a] border-2 border-red-500/50 rounded-3xl shadow-[0_0_100px_rgba(239,68,68,0.4)] p-10 max-w-lg w-full mx-4 text-center animate-[fadeIn_0.2s_ease]">
                        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
                            <CameraOff className="text-red-500" size={40} />
                        </div>
                        {totalViolations >= 3 ? (
                            <>
                                <h2 className="text-3xl font-black text-red-400 mb-4">Interview Terminated!</h2>
                                <p className="text-slate-300 text-lg leading-relaxed mb-8">
                                    You exceeded the maximum limit of <span className="text-red-400 font-bold">3 violations</span>. Your interview has been automatically ended.
                                </p>
                            </>
                        ) : (
                            <>
                                <h2 className="text-2xl font-black text-red-400 mb-3">⚠ Screenshot Blocked</h2>
                                <p className="text-slate-300 text-base leading-relaxed mb-6">
                                    Taking screenshots or using capturing tools is <span className="text-red-400 font-bold">strictly prohibited</span> to protect test integrity.
                                </p>
                                <div className="mb-8 inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-red-500/10 border border-red-500/30">
                                    <span className="text-red-400 font-black">Warning {totalViolations} / 3</span>
                                </div>
                            </>
                        )}
                        <button onClick={dismissScreenshotWarning} className={`w-full py-4 rounded-xl font-black text-white text-lg transition-all ${totalViolations >= 3 ? 'bg-red-600 hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]'}`}>
                            {totalViolations >= 3 ? 'View Results' : 'Return to Interview'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InterviewSession;
