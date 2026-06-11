import { useState, useEffect, useRef } from 'react';
import { Brain, Clock, CheckCircle, XCircle, ChevronRight, Activity, TrendingUp, Edit3, Target, ShieldAlert, MonitorOff, Files, CameraOff, Video, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import ProctoringMonitor from '../../components/proctoring/ProctoringMonitor';

const TIMER_SECONDS = 40 * 60; // 40 minutes for the full test

const getCategoryLabel = (cat) => {
    const map = {
        'APTITUDE': 'Quantitative Aptitude',
        'LOGICAL': 'Logical Reasoning',
        'COMMUNICATION': 'Communication Skills',
        'DOMAIN': 'Domain-Based Tech',
    };
    return map[cat] || cat;
};

export default function AptitudePractice() {
    const [status, setStatus] = useState('LANDING'); // LANDING, LOADING, PLAYING, RESULTS
    const [selectedCategory, setSelectedCategory] = useState('FULL_TEST');
    const [questions, setQuestions] = useState([]);
    const [current, setCurrent] = useState(0);
    const [answers, setAnswers] = useState([]); // [{question_id: 1, selected: 'A'}]
    const [timer, setTimer] = useState(TIMER_SECONDS);
    const [results, setResults] = useState(null);
    const [warnings, setWarnings] = useState(0);
    const [tabSwitches, setTabSwitches] = useState(0);
    const [screenshotWarnings, setScreenshotWarnings] = useState(0);
    const [showSubmitDialog, setShowSubmitDialog] = useState(false);
    const [showEscWarningDialog, setShowEscWarningDialog] = useState(false);
    const [showTabWarningDialog, setShowTabWarningDialog] = useState(false);
    const [showScreenshotWarningDialog, setShowScreenshotWarningDialog] = useState(false);
    const [visited, setVisited] = useState(new Set()); // indices of visited questions
    const [currentSelection, setCurrentSelection] = useState(null); // selected option for current question
    const timerRef = useRef(null);
    const fullscreenListenerRef = useRef(null);
    const visibilityListenerRef = useRef(null);
    const warningsRef = useRef(0); // Keep a ref in sync for use inside event listeners
    const tabSwitchesRef = useRef(0);
    const screenshotWarningsRef = useRef(0);
    const intentionalExitRef = useRef(false); // Track when we intentionally exit fullscreen (submit)
    
    // Comprehensive Proctoring Logs
    const [proctoringLogs, setProctoringLogs] = useState([]);
    const proctoringLogsRef = useRef([]);
    const [severeViolationMsg, setSevereViolationMsg] = useState(null);

    useEffect(() => {
        return () => {
            clearInterval(timerRef.current);
            if (fullscreenListenerRef.current) {
                document.removeEventListener('fullscreenchange', fullscreenListenerRef.current);
            }
            if (visibilityListenerRef.current) {
                document.removeEventListener('visibilitychange', visibilityListenerRef.current);
            }
            document.body.classList.remove('hide-dashboard-sidebar');
        };
    }, []);

    // Keep warningsRef in sync with warnings state
    useEffect(() => {
        warningsRef.current = warnings;
    }, [warnings]);

    useEffect(() => {
        tabSwitchesRef.current = tabSwitches;
    }, [tabSwitches]);

    useEffect(() => {
        screenshotWarningsRef.current = screenshotWarnings;
    }, [screenshotWarnings]);

    const totalViolations = warnings + tabSwitches + screenshotWarnings;
    const totalViolationsRef = () => warningsRef.current + tabSwitchesRef.current + screenshotWarningsRef.current;

    const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);

    const prepareTest = async () => {
        setStatus('LOADING');
        try {
            const endpoint = selectedCategory === 'FULL_TEST'
                ? '/interviews/aptitude/questions/full_test/'
                : `/interviews/aptitude/questions/?category=${selectedCategory}`;

            const res = await api.get(endpoint);
            if (res.data.length === 0) {
                toast.error("No questions found in database.");
                setStatus('LANDING');
                return;
            }

            const testTime = selectedCategory === 'FULL_TEST' ? 40 * 60 : 10 * 60;

            setQuestions(res.data);
            setCurrent(0);
            setAnswers([]);
            setTimer(testTime);

            // Fetch simulated loading delay
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            setStatus('PRE_TEST_INSTRUCTIONS');
        } catch (error) {
            toast.error("Failed to load test session.");
            setStatus('LANDING');
        }
    };

    const startActualTest = async () => {
        setIsRequestingPermissions(true);
        try {
            // Request camera and microphone access
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                // Stop tracks immediately since the ProctoringMonitor will request its own
                stream.getTracks().forEach(track => track.stop());
            } catch (err) {
                toast.error("Camera and Microphone permissions are strictly required to start the test.");
                setIsRequestingPermissions(false);
                return;
            }
            
            // Now request fullscreen on the button click gesture
            try {
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                }
            } catch (err) {
                console.log("Fullscreen request failed:", err);
            }

            // Reset all violation counters — both state AND refs
            setWarnings(0);
            warningsRef.current = 0;
            setTabSwitches(0);
            tabSwitchesRef.current = 0;
            setScreenshotWarnings(0);
            screenshotWarningsRef.current = 0;
            intentionalExitRef.current = false;
            setProctoringLogs([]);
            proctoringLogsRef.current = [];
            setSevereViolationMsg(null);

            setVisited(new Set([0]));

            // Register proctoring listeners
            if (fullscreenListenerRef.current) {
                document.removeEventListener('fullscreenchange', fullscreenListenerRef.current);
            }
            if (visibilityListenerRef.current) {
                document.removeEventListener('visibilitychange', visibilityListenerRef.current);
            }
            if (window._cleanupKeyDown) {
                document.removeEventListener('keydown', window._cleanupKeyDown);
                window._cleanupKeyDown = null;
            }
            if (window._cleanupKeyUp) {
                document.removeEventListener('keyup', window._cleanupKeyUp);
                window._cleanupKeyUp = null;
            }
            if (window._cleanupBlur) {
                window.removeEventListener('blur', window._cleanupBlur);
                window._cleanupBlur = null;
            }

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

                if (isMacScreenshot || isPrint || isWindowsSnippet) {
                    e.preventDefault();
                    triggerScreenshotWarning();
                }
            };
            
            const handleKeyUp = (e) => {
                if (e.key === 'PrintScreen') {
                    e.preventDefault();
                    triggerScreenshotWarning();
                }
                
                if (e.key === 's' || e.key === 'S' || e.key === 'Meta' || e.key === 'Shift') {
                    if ((e.metaKey && e.shiftKey) || (e.key === 's' && e.metaKey && e.shiftKey)) {
                         triggerScreenshotWarning();
                    }
                }
            };

            const handleBlur = () => {
                if (status === 'PLAYING' && document.fullscreenElement) {
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

            // Detect when fullscreen is exited (ESC key, F11, or any other means)
            const handleFullscreenChange = () => {
                if (!document.fullscreenElement) {
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
                if (document.hidden) {
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

            setStatus('PLAYING');

            document.body.classList.add('hide-dashboard-sidebar');

            clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                setTimer(t => {
                    const testTime = selectedCategory === 'FULL_TEST' ? 40 * 60 : 10 * 60;
                    if (t <= 1) {
                        clearInterval(timerRef.current);
                        submitTest(answers, 0, testTime);
                        return 0;
                    }
                    return t - 1;
                });
            }, 1000);
        } catch (error) {
            toast.error("Failed to initialize test environment.");
        } finally {
            setIsRequestingPermissions(false);
        }
    };

    const submitTest = async (finalAnswers, timeRemaining, totalTime, customWarnings = null, customTabSwitches = null, customScreenshotWarnings = null) => {
        clearInterval(timerRef.current);
        document.body.classList.remove('hide-dashboard-sidebar');

        if (fullscreenListenerRef.current) {
            document.removeEventListener('fullscreenchange', fullscreenListenerRef.current);
            fullscreenListenerRef.current = null;
        }
        if (visibilityListenerRef.current) {
            document.removeEventListener('visibilitychange', visibilityListenerRef.current);
            visibilityListenerRef.current = null;
        }
        if (window._cleanupKeyDown) {
            document.removeEventListener('keydown', window._cleanupKeyDown);
            window._cleanupKeyDown = null;
        }
        if (window._cleanupKeyUp) {
            document.removeEventListener('keyup', window._cleanupKeyUp);
            window._cleanupKeyUp = null;
        }
        if (window._cleanupBlur) {
            window.removeEventListener('blur', window._cleanupBlur);
            window._cleanupBlur = null;
        }

        if (document.fullscreenElement) {
            try {
                intentionalExitRef.current = true;
                await document.exitFullscreen();
            } catch(e) {
                intentionalExitRef.current = false;
            }
        }

        const timeTaken = (totalTime || (selectedCategory === 'FULL_TEST' ? 40 * 60 : 10 * 60)) - timeRemaining;
        const violationsCount = customWarnings !== null ? customWarnings : warnings;
        const tabViolationsCount = customTabSwitches !== null ? customTabSwitches : tabSwitches;
        const screenshotViolationsCount = customScreenshotWarnings !== null ? customScreenshotWarnings : screenshotWarnings;

        // Ensure all questions are included in the submission
        const completeAnswers = questions.map(q => {
            const ans = finalAnswers.find(a => a.question_id === q.id);
            return ans ? ans : { question_id: q.id, selected: null };
        });

        try {
            const res = await api.post('/interviews/aptitude/results/evaluate_test/', {
                category: selectedCategory,
                answers: completeAnswers,
                time_taken_seconds: timeTaken,
                fullscreen_violations: violationsCount,
                tab_violations: tabViolationsCount,
                screenshot_violations: screenshotViolationsCount,
                proctoring_logs: proctoringLogsRef.current
            });
            setResults(res.data);
            setStatus('RESULTS');
        } catch (error) {
            toast.error("Failed to submit test.");
        }
    };

    const addProctoringLog = (type, message, severity) => {
        const logEntry = { type, message, severity, timestamp: new Date().toISOString() };
        proctoringLogsRef.current = [...proctoringLogsRef.current, logEntry];
        setProctoringLogs(proctoringLogsRef.current);
        
        if (severity === 'severe' && status === 'PLAYING') {
            setSevereViolationMsg(message);
            // Give the candidate a chance to read the severe warning before auto-submitting
            setTimeout(() => {
                 submitTest(answers, timer, (selectedCategory === 'FULL_TEST' ? 40 * 60 : 10 * 60));
            }, 4000);
        }
    };

    const dismissEscWarning = async () => {
        setShowEscWarningDialog(false);
        if (totalViolations >= 3) {
            const totalTime = selectedCategory === 'FULL_TEST' ? 40 * 60 : 10 * 60;
            await submitTest(answers, timer, totalTime, warnings, tabSwitches, screenshotWarnings);
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
            const totalTime = selectedCategory === 'FULL_TEST' ? 40 * 60 : 10 * 60;
            await submitTest(answers, timer, totalTime, warnings, tabSwitches, screenshotWarnings);
        }
    };

    const dismissScreenshotWarning = async () => {
        setShowScreenshotWarningDialog(false);
        if (totalViolations >= 3) {
            const totalTime = selectedCategory === 'FULL_TEST' ? 40 * 60 : 10 * 60;
            await submitTest(answers, timer, totalTime, warnings, tabSwitches, screenshotWarnings);
        }
    };

    useEffect(() => {
        if (questions.length > 0) {
            const existing = answers.find(a => a.question_id === questions[current]?.id);
            setCurrentSelection(existing ? existing.selected : null);
        }
    }, [current, questions]);

    const handleSelectOption = (option) => {
        setCurrentSelection(option);
        const qId = questions[current].id;
        const exists = answers.find(a => a.question_id === qId);
        if (exists) {
            setAnswers(prev => prev.map(a => a.question_id === qId ? { ...a, selected: option } : a));
        } else {
            setAnswers(prev => [...prev, { question_id: qId, selected: option }]);
        }
    };

    const goToNext = () => {
        if (current + 1 >= questions.length) {
            const totalTime = selectedCategory === 'FULL_TEST' ? 40 * 60 : 10 * 60;
            submitTest(answers, timer, totalTime);
        } else {
            const nextIdx = current + 1;
            setVisited(prev => new Set([...prev, nextIdx]));
            setCurrent(nextIdx);
        }
    };

    const jumpToQuestion = (idx) => {
        setVisited(prev => new Set([...prev, idx]));
        setCurrent(idx);
    };

    const handleManualSubmit = () => {
        setShowSubmitDialog(true);
    };

    const confirmSubmit = () => {
        setShowSubmitDialog(false);
        const totalTime = selectedCategory === 'FULL_TEST' ? 40 * 60 : 10 * 60;
        submitTest(answers, timer, totalTime);
    };

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const optionLabels = ['A', 'B', 'C', 'D'];
    const getOptionText = (q, l) => q[`option_${l.toLowerCase()}`];

    if (status === 'LANDING') {
        const testOptions = [
            { key: 'FULL_TEST', label: 'Full Readiness Test', icon: <Brain size={24} />, desc: '80 Questions · 40 Mins', glow: 'shadow-[0_0_40px_rgba(99,102,241,0.4)]', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500', ring: 'ring-indigo-500' },
            { key: 'APTITUDE', label: 'Quantitative Aptitude', icon: <TrendingUp size={24} />, desc: '20 Questions · 10 Mins', glow: 'shadow-[0_0_40px_rgba(16,185,129,0.4)]', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500', ring: 'ring-emerald-500' },
            { key: 'LOGICAL', label: 'Logical Reasoning', icon: <Activity size={24} />, desc: '20 Questions · 10 Mins', glow: 'shadow-[0_0_40px_rgba(59,130,246,0.4)]', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500', ring: 'ring-blue-500' },
            { key: 'COMMUNICATION', label: 'Communication Skills', icon: <Edit3 size={24} />, desc: '20 Questions · 10 Mins', glow: 'shadow-[0_0_40px_rgba(236,72,153,0.4)]', color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500', ring: 'ring-pink-500' },
            { key: 'DOMAIN', label: 'Domain-Based Tech', icon: <Target size={24} />, desc: '20 Questions · 10 Mins', glow: 'shadow-[0_0_40px_rgba(168,85,247,0.4)]', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500', ring: 'ring-purple-500' },
        ];

        return (
            <div className="max-w-5xl mx-auto text-center py-12 relative min-h-[80vh] flex flex-col justify-center">
                {/* Ambient Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[150px] pointer-events-none -z-10" />

                <div className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(99,102,241,0.3)] border border-white/10 backdrop-blur-md">
                    <Brain size={44} className="text-indigo-400" />
                </div>
                
                <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 mb-6 tracking-tight">Aptitude & Readiness Practice</h1>
                <p className="text-slate-300 text-lg mb-12 max-w-2xl mx-auto font-medium leading-relaxed">
                    Choose a comprehensive 80-question assessment or focus on specific domains. Our AI-proctored environment simulates real hiring conditions.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16 text-left">
                    {testOptions.map(opt => {
                        const isSelected = selectedCategory === opt.key;
                        return (
                            <button
                                key={opt.key}
                                onClick={() => setSelectedCategory(opt.key)}
                                className={`p-6 rounded-[2rem] border transition-all duration-300 relative overflow-hidden group ${
                                    isSelected
                                        ? `${opt.border} bg-[#0a0a0a]/80 ring-2 ring-offset-4 ring-offset-black ${opt.ring} ${opt.glow} transform scale-105`
                                        : 'border-white/10 bg-[#0a0a0a]/50 backdrop-blur-xl hover:border-white/30 hover:bg-[#111]/80 hover:scale-[1.02]'
                                }`}
                            >
                                {isSelected && <div className={`absolute inset-0 ${opt.bg} opacity-20`} />}
                                <div className={`${opt.color} mb-4 relative z-10 p-3 rounded-2xl bg-white/5 inline-block border border-white/5`}>
                                    {opt.icon}
                                </div>
                                <h4 className="text-white font-bold text-xl mb-1 relative z-10">{opt.label}</h4>
                                <p className="text-sm text-slate-400 relative z-10 font-medium">{opt.desc}</p>
                            </button>
                        );
                    })}
                </div>

                <div>
                    <button onClick={prepareTest} className="px-14 py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xl font-bold transition-all shadow-[0_0_40px_rgba(99,102,241,0.5)] hover:shadow-[0_0_60px_rgba(99,102,241,0.7)] hover:scale-105 flex items-center justify-center gap-3 mx-auto">
                        Start {selectedCategory === 'FULL_TEST' ? 'Full Assessment' : 'Practice Test'}
                        <ChevronRight size={24} />
                    </button>
                </div>
            </div>
        );
    }

    if (status === 'RESULTS' && results) {
        return (
            <div className="max-w-5xl mx-auto relative pb-20">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-600/10 rounded-full blur-[150px] pointer-events-none -z-10" />

                <div className="text-center mb-12">
                    <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400 mb-2">Performance Dashboard</h1>
                    <p className="text-slate-400 font-medium">Here is your detailed readiness report</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div className="bg-[#0a0a0a]/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-10 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none" />
                        
                        <div className="inline-flex relative mb-6">
                            <svg className="w-40 h-40 transform -rotate-90">
                                <circle cx="80" cy="80" r="72" className="stroke-white/5 w-full h-full fill-transparent" strokeWidth="12" strokeLinecap="round"></circle>
                                <circle cx="80" cy="80" r="72" className="stroke-indigo-500 w-full h-full fill-transparent transition-all duration-1000 ease-out" strokeWidth="12" strokeLinecap="round"
                                    strokeDasharray={452} strokeDashoffset={452 - (452 * (results.score / results.total_questions))}></circle>
                            </svg>
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center flex flex-col items-center">
                                <span className="text-5xl font-black text-white">{results.score}</span>
                                <span className="text-sm font-bold text-slate-500">/{results.total_questions}</span>
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1">Total Score</h3>
                    </div>

                    <div className="bg-[#0a0a0a]/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl col-span-2 flex flex-col justify-center">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                            <Activity className="text-indigo-400" size={24} /> Domain Breakdown
                        </h3>
                        <div className="space-y-6">
                            {Object.entries(results.domain_scores || {}).map(([dom, data]) => (
                                <div key={dom} className="group">
                                    <div className="flex justify-between text-sm mb-2">
                                        <span className="font-bold text-slate-200 uppercase tracking-wide text-xs">{getCategoryLabel(dom)}</span>
                                        <span className="text-slate-400 font-bold bg-white/5 px-2 py-0.5 rounded-md">{data.score} / {data.total}</span>
                                    </div>
                                    <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                        <div className={`h-full rounded-full transition-all duration-1000 relative ${
                                            data.score / data.total > 0.7 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)]' : 
                                            data.score / data.total > 0.4 ? 'bg-gradient-to-r from-amber-600 to-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 
                                            'bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_15px_rgba(248,113,113,0.5)]'
                                        }`} style={{ width: `${(data.score / data.total) * 100}%` }}>
                                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {results.proctoring_logs && results.proctoring_logs.length > 0 ? (
                    <div className="mb-10 p-6 bg-red-950/30 border border-red-500/30 rounded-3xl backdrop-blur-xl">
                        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-red-500/20">
                            <ShieldAlert className="text-red-500" size={28} />
                            <h3 className="text-xl font-bold text-white">Proctoring Intervention Logs</h3>
                            <span className="ml-auto bg-red-500/20 border border-red-500/30 text-red-300 text-sm font-bold px-4 py-1.5 rounded-full">
                                {results.proctoring_logs.length} Infraction{results.proctoring_logs.length > 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="space-y-3 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                            {results.proctoring_logs.map((log, idx) => (
                                <div key={idx} className={`p-4 rounded-2xl border flex items-start gap-4 ${log.severity === 'severe' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                                    <div className="mt-0.5 bg-white/10 p-2 rounded-xl">
                                        {log.severity === 'severe' ? <XCircle size={20} className="text-red-400" /> : <AlertTriangle size={20} className="text-amber-400" />}
                                    </div>
                                    <div>
                                        <p className={`font-semibold text-base mb-1 ${log.severity === 'severe' ? 'text-red-300' : 'text-amber-300'}`}>{log.message}</p>
                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                            <span className="uppercase tracking-widest">{log.type.replace(/_/g, ' ')}</span>
                                            <span>•</span>
                                            <span className="bg-black/30 px-2 py-1 rounded-md">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    (results.fullscreen_violations > 0 || results.tab_violations > 0 || results.screenshot_violations > 0) && (
                        <div className="mb-10 p-6 bg-red-950/30 border border-red-500/30 rounded-3xl backdrop-blur-xl flex items-start gap-5">
                            <div className="bg-red-500/20 p-3 rounded-2xl">
                                <XCircle className="text-red-400 flex-shrink-0" size={28} />
                            </div>
                            <div>
                                <h4 className="text-red-400 font-bold text-lg mb-2">Testing Integrity Warning</h4>
                                {results.fullscreen_violations > 0 && <p className="text-red-300/80 font-medium mb-1">• Attempted to exit full-screen mode {results.fullscreen_violations} time(s).</p>}
                                {results.tab_violations > 0 && <p className="text-red-300/80 font-medium mb-1">• Attempted to switch browser tabs {results.tab_violations} time(s).</p>}
                                {results.screenshot_violations > 0 && <p className="text-red-300/80 font-medium mb-1">• Attempted to take screenshots {results.screenshot_violations} time(s).</p>}
                            </div>
                        </div>
                    )
                )}

                <div className="flex items-center gap-3 mb-6 mt-12">
                    <Files className="text-indigo-400" size={24} />
                    <h3 className="font-black text-2xl text-white">Detailed Paper Review</h3>
                </div>
                
                <div className="space-y-5">
                    {results.detailed_responses?.map((r, i) => (
                        <div key={i} className={`bg-[#0a0a0a]/60 backdrop-blur-xl border rounded-3xl p-6 shadow-xl transition-all ${r.is_correct ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
                            <div className="flex gap-5">
                                <div className="mt-1">
                                    {r.is_correct ? (
                                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(52,211,153,0.2)]">
                                            <CheckCircle className="text-emerald-400" size={22} />
                                        </div>
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(248,113,113,0.2)]">
                                            <XCircle className="text-red-400" size={22} />
                                        </div>
                                    )}
                                </div>
                                <div className="w-full">
                                    <div className="flex justify-between items-start mb-4">
                                        <p className="text-slate-100 font-semibold text-lg leading-relaxed max-w-2xl">{i + 1}. {r.question_text}</p>
                                        <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-lg ml-4 whitespace-nowrap uppercase tracking-wider">{getCategoryLabel(r.category)}</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Your Answer</p>
                                            <p className={`font-semibold ${r.is_correct ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {r.selected ? `Option ${r.selected} - ${r[`option_${r.selected.toLowerCase()}`]}` : 'Unattempted'}
                                            </p>
                                        </div>
                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Correct Answer</p>
                                            <p className="font-semibold text-emerald-400">
                                                Option {r.correct} - {r[`option_${r.correct.toLowerCase()}`]}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {r.explanation && (
                                        <div className="mt-4 p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 text-sm text-indigo-100/80 leading-relaxed font-medium">
                                            <span className="font-bold text-indigo-400 mr-2 uppercase tracking-wider text-xs">Explanation:</span>
                                            {r.explanation}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-16 text-center">
                    <button onClick={() => setStatus('LANDING')} className="px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold transition-all flex items-center justify-center gap-3 mx-auto">
                        Take Another Test
                    </button>
                </div>
            </div>
        );
    }

    if (status === 'LOADING') {
        const testLabel = selectedCategory === 'FULL_TEST' ? 'Full Readiness Test' : getCategoryLabel(selectedCategory);
        return (
            <div className="fixed inset-0 bg-[#050505] flex flex-col items-center justify-center z-50">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[100px] pointer-events-none" />
                <div className="text-center relative z-10">
                    <div className="relative mb-10 w-32 h-32 mx-auto">
                        <div className="absolute inset-0 rounded-full border-[6px] border-indigo-500/10 border-t-indigo-500 animate-[spin_1.5s_linear_infinite]" />
                        <div className="absolute inset-2 rounded-full border-[4px] border-purple-500/10 border-l-purple-500 animate-[spin_2s_linear_infinite_reverse]" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Brain size={36} className="text-indigo-400" />
                        </div>
                    </div>
                    <h2 className="text-4xl font-black text-white mb-3">Initializing Session</h2>
                    <p className="text-indigo-300 font-bold text-lg mb-2">{testLabel}</p>
                    <p className="text-slate-500 font-medium">Securing browser environment and loading paper...</p>
                </div>
            </div>
        );
    }

    if (status === 'PRE_TEST_INSTRUCTIONS') {
        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center p-6 z-50">
                <div className="bg-[#0a0a0a]/90 backdrop-blur-3xl border border-white/10 rounded-3xl w-full max-w-3xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.8)] flex flex-col">
                    <div className="p-8 border-b border-white/10 flex items-center gap-4 bg-gradient-to-r from-amber-500/10 to-transparent">
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                            <ShieldAlert className="text-amber-400" size={28} />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-white">Security & Permissions</h2>
                            <p className="text-amber-400/80 font-medium mt-1">Please read carefully before proceeding</p>
                        </div>
                    </div>
                    
                    <div className="p-8 overflow-y-auto max-h-[60vh] flex-1 text-slate-300">
                        <p className="mb-8 text-lg font-medium leading-relaxed">
                            This assessment is <span className="text-white font-bold">strictly AI-proctored</span>. To maintain integrity, your browser environment will be locked and monitored.
                        </p>
                        
                        <div className="space-y-4 mb-8">
                            <div className="flex items-start gap-5 p-5 rounded-2xl bg-white/5 border border-white/5 transition-all hover:bg-white/10">
                                <div className="p-3 bg-red-500/10 rounded-xl shrink-0 mt-0.5 border border-red-500/20">
                                    <MonitorOff className="text-red-400" size={22} />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-lg mb-1">No Exiting Fullscreen</h4>
                                    <p className="text-slate-400 leading-relaxed">The test runs in forced fullscreen. Attempting to exit (via ESC or F11) will trigger a violation warning.</p>
                                </div>
                            </div>
                            
                            <div className="flex items-start gap-5 p-5 rounded-2xl bg-white/5 border border-white/5 transition-all hover:bg-white/10">
                                <div className="p-3 bg-red-500/10 rounded-xl shrink-0 mt-0.5 border border-red-500/20">
                                    <Files className="text-red-400" size={22} />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-lg mb-1">No Tab Switching</h4>
                                    <p className="text-slate-400 leading-relaxed">Navigating to other browser tabs or opening external applications is strictly prohibited.</p>
                                </div>
                            </div>
                            
                            <div className="flex items-start gap-5 p-5 rounded-2xl bg-white/5 border border-white/5 transition-all hover:bg-white/10">
                                <div className="p-3 bg-red-500/10 rounded-xl shrink-0 mt-0.5 border border-red-500/20">
                                    <CameraOff className="text-red-400" size={22} />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-lg mb-1">No Screenshots</h4>
                                    <p className="text-slate-400 leading-relaxed">Using keyboard shortcuts for screenshots or the snipping tool will be logged immediately.</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full" />
                            <h4 className="text-indigo-300 font-bold text-lg mb-2 flex items-center gap-3">
                                <Video size={20} /> Camera and Microphone Required
                            </h4>
                            <p className="text-indigo-200/70 font-medium leading-relaxed relative z-10">
                                You must grant permission to your camera and microphone on the next prompt. The test cannot begin without these permissions for identity verification and anti-cheat monitoring.
                            </p>
                        </div>
                    </div>
                    
                    <div className="p-6 border-t border-white/10 bg-black/40 flex items-center justify-between">
                        <p className="text-red-400 font-bold text-sm bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20">
                            ⚠ 3 Violations = Auto-Submit
                        </p>
                        <div className="flex gap-4">
                            <button onClick={() => setStatus('LANDING')} className="px-6 py-3 font-bold text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-white/5">
                                Cancel
                            </button>
                            <button 
                                onClick={startActualTest} 
                                disabled={isRequestingPermissions}
                                className={`px-8 py-3 rounded-xl font-bold text-white transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] flex items-center gap-2 ${
                                    isRequestingPermissions ? 'opacity-70 bg-indigo-800 cursor-wait' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:scale-105'
                                }`}
                            >
                                {isRequestingPermissions ? 'Requesting...' : 'I Understand, Start Test'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const getPaletteColor = (idx) => {
        const qId = questions[idx]?.id;
        const isAnswered = answers.some(a => a.question_id === qId);
        if (isAnswered) return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
        if (visited.has(idx)) return 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]';
        return 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20';
    };

    const q = questions[current];
    if (!q) return <div className="text-slate-400 p-10 text-center">Loading test environment…</div>;

    return (
        <div 
            className="flex h-screen w-full fixed inset-0 bg-[#050505] overflow-hidden select-none font-sans"
            onCopy={(e) => { e.preventDefault(); addProctoringLog('copy_attempt', 'Attempted to copy test content.', 'warning'); toast.error("Copying text is not allowed."); }}
            onCut={(e) => { e.preventDefault(); addProctoringLog('cut_attempt', 'Attempted to cut test content.', 'warning'); toast.error("Cutting text is not allowed."); }}
            onPaste={(e) => { e.preventDefault(); addProctoringLog('paste_attempt', 'Attempted to paste content.', 'warning'); toast.error("Pasting text is not allowed."); }}
            onContextMenu={(e) => { e.preventDefault(); addProctoringLog('right_click', 'Attempted to open context menu.', 'warning'); toast.error("Right-click is disabled."); }}
            onDragStart={(e) => e.preventDefault()}
        >
            {/* Ambient Background for Test Area */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[150px] pointer-events-none" />

            {severeViolationMsg && (
                <div className="fixed inset-0 z-[100] bg-red-950/90 flex flex-col items-center justify-center p-6 text-center animate-[fadeIn_0.2s_ease] backdrop-blur-xl">
                    <div className="w-32 h-32 rounded-full bg-red-500/20 flex items-center justify-center mb-8 shadow-[0_0_60px_rgba(239,68,68,0.5)]">
                        <ShieldAlert className="text-red-500 animate-pulse" size={64} />
                    </div>
                    <h2 className="text-5xl font-black text-white mb-6">Severe Violation Detected</h2>
                    <p className="text-2xl text-red-300 font-bold mb-10 max-w-3xl leading-relaxed">{severeViolationMsg}</p>
                    <div className="flex items-center gap-4 text-slate-300 font-bold text-lg bg-black/40 px-6 py-3 rounded-2xl border border-white/10">
                        <div className="w-6 h-6 rounded-full border-[3px] border-slate-500 border-t-white animate-spin" />
                        Terminating and Submitting Test...
                    </div>
                </div>
            )}

            {/* ── Left: Question Palette Sidebar ── */}
            <aside className="w-80 flex-shrink-0 bg-[#0a0a0a]/80 backdrop-blur-2xl border-r border-white/10 flex flex-col overflow-hidden shadow-2xl relative z-10">
                <div className="p-6 border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent">
                    <h3 className="text-white font-black text-lg mb-4 tracking-wide uppercase">Question Palette</h3>
                    <div className="flex flex-col gap-3 text-sm font-bold">
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-md bg-emerald-500/20 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]" />
                            <span className="text-slate-300">Answered</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-md bg-amber-500/20 border border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]" />
                            <span className="text-slate-300">Visited, Unanswered</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-md bg-white/5 border border-white/10" />
                            <span className="text-slate-500">Not Visited</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="grid grid-cols-5 gap-3">
                        {questions.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => jumpToQuestion(idx)}
                                className={`w-full aspect-square rounded-xl text-sm font-bold border transition-all duration-200 flex items-center justify-center
                                    ${getPaletteColor(idx)}
                                    ${current === idx ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0a] scale-110 z-10 bg-indigo-600/50 border-indigo-400 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)]' : ''}`}
                            >
                                {idx + 1}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 bg-black/40">
                    <button
                        onClick={handleManualSubmit}
                        className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] hover:scale-[1.02] border border-indigo-400/30"
                    >
                        Submit Test
                    </button>
                </div>
            </aside>

            {/* ── Right: Main Question Area ── */}
            <div className="flex-1 flex flex-col relative z-10">
                {/* Sleek Top Bar */}
                <header className="h-20 px-8 border-b border-white/10 bg-[#0a0a0a]/60 backdrop-blur-xl flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                            <Brain className="text-indigo-400" size={24} />
                        </div>
                        <div>
                            <span className="text-indigo-400 font-bold text-xs tracking-widest uppercase block mb-0.5">{getCategoryLabel(q.category)}</span>
                            <h1 className="text-xl font-black text-white">Question {current + 1} <span className="text-slate-500 font-bold">/ {questions.length}</span></h1>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl font-bold text-sm border transition-all ${
                            totalViolations > 0 ? 'text-amber-300 bg-amber-500/10 border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'text-slate-400 bg-white/5 border-white/10'
                        }`}>
                            <Activity size={18} /> 
                            Violations: {totalViolations}/3
                        </div>
                        
                        <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-black text-xl border transition-all ${
                            timer <= 300 
                                ? 'text-red-400 bg-red-500/10 border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-pulse' 
                                : 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)]'
                        }`}>
                            <Clock size={24} />{formatTime(timer)}
                        </div>
                    </div>
                </header>

                <div className="w-full h-1 bg-white/5 relative">
                    <div className="absolute h-full top-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all duration-500"
                        style={{ width: `${(answers.length / questions.length) * 100}%` }} />
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 mb-8 backdrop-blur-md shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500" />
                            <p className="text-white font-semibold text-2xl leading-relaxed pl-4">{q.question_text}</p>
                        </div>

                        <div className="space-y-4 mb-10">
                            {optionLabels.map(l => {
                                const isSelected = currentSelection === l;
                                return (
                                    <button key={l} onClick={() => handleSelectOption(l)}
                                        className={`w-full flex items-center gap-5 px-6 py-5 rounded-2xl border transition-all duration-200 text-left group ${
                                            isSelected
                                                ? 'border-indigo-400 bg-indigo-500/10 shadow-[inset_0_0_30px_rgba(99,102,241,0.2),0_0_20px_rgba(99,102,241,0.15)] ring-1 ring-indigo-400/50 scale-[1.01]'
                                                : 'border-white/10 bg-[#0a0a0a]/50 hover:border-white/30 hover:bg-white/5 hover:scale-[1.005]'
                                        }`}>
                                        <span className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0 transition-all ${
                                            isSelected 
                                                ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30' 
                                                : 'bg-white/5 text-slate-400 border border-white/10 group-hover:bg-white/10 group-hover:text-white'
                                        }`}>{l}</span>
                                        <span className={`text-xl font-medium ${isSelected ? 'text-white' : 'text-slate-300'}`}>{getOptionText(q, l)}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center justify-between border-t border-white/10 pt-8 mt-4">
                            <button onClick={goToNext} className="text-slate-400 hover:text-white font-bold text-lg px-6 py-3 transition-colors hover:bg-white/5 rounded-xl">
                                Skip for now
                            </button>
                            <button
                                onClick={goToNext}
                                disabled={!currentSelection}
                                className={`px-10 py-4 rounded-2xl font-black text-lg transition-all flex items-center gap-3 ${
                                    currentSelection
                                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:scale-105 text-white shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_40px_rgba(99,102,241,0.6)]'
                                        : 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                                }`}
                            >
                                {current + 1 === questions.length ? 'Finish Test' : 'Save & Next'}
                                <ChevronRight size={24} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {status === 'PLAYING' && (
                <ProctoringMonitor
                    testId="aptitude_practice"
                    onViolation={(violation) => {
                        addProctoringLog(violation.type, violation.msg, violation.severity);
                        if (violation.severity !== 'severe') {
                            toast.error(`Warning: ${violation.msg}`, { duration: 5000 });
                        }
                    }}
                />
            )}

            {/* Modals styling updated similarly ... */}
            {showSubmitDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                    <div className="relative bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.8)] p-10 max-w-md w-full mx-4 text-center">
                        <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center mx-auto mb-6 border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                            <CheckCircle className="text-indigo-400" size={36} />
                        </div>
                        <h3 className="text-2xl font-black text-white mb-2">Submit Test?</h3>
                        <p className="text-slate-400 font-medium mb-8 leading-relaxed">Are you sure you want to finalize your answers and end the test?</p>
                        <div className="flex gap-4 justify-center">
                            <button onClick={() => setShowSubmitDialog(false)} className="flex-1 px-5 py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all border border-white/10">
                                Cancel
                            </button>
                            <button onClick={confirmSubmit} className="flex-1 px-5 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] border border-indigo-400/30">
                                Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showEscWarningDialog && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="absolute inset-0 bg-red-950/80 backdrop-blur-md" />
                    <div className="relative bg-[#0a0a0a] border-2 border-red-500/50 rounded-3xl shadow-[0_0_100px_rgba(239,68,68,0.4)] p-10 max-w-lg w-full mx-4 text-center animate-[fadeIn_0.2s_ease]">
                        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
                            <XCircle className="text-red-500" size={40} />
                        </div>
                        {totalViolations >= 3 ? (
                            <>
                                <h2 className="text-3xl font-black text-red-400 mb-4">Test Terminated!</h2>
                                <p className="text-slate-300 text-lg leading-relaxed mb-8">
                                    You exceeded the maximum limit of <span className="text-red-400 font-bold">3 violations</span>. Your test has been automatically submitted.
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

            {/* Simulating Tab and Screenshot Dialogs similar to ESC Warning */}
            {showTabWarningDialog && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center">
                    <div className="absolute inset-0 bg-amber-950/80 backdrop-blur-md" />
                    <div className="relative bg-[#0a0a0a] border-2 border-amber-500/50 rounded-3xl shadow-[0_0_100px_rgba(245,158,11,0.4)] p-10 max-w-lg w-full mx-4 text-center animate-[fadeIn_0.2s_ease]">
                        <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                            <AlertTriangle className="text-amber-400" size={40} />
                        </div>
                        {totalViolations >= 3 ? (
                            <>
                                <h2 className="text-3xl font-black text-red-400 mb-4">Test Terminated!</h2>
                                <p className="text-slate-300 text-lg leading-relaxed mb-8">
                                    You exceeded the maximum limit of <span className="text-red-400 font-bold">3 violations</span>. Your test has been automatically submitted.
                                </p>
                            </>
                        ) : (
                            <>
                                <h2 className="text-2xl font-black text-amber-400 mb-3">⚠ Focus Violation</h2>
                                <p className="text-slate-300 text-base leading-relaxed mb-6">
                                    Switching tabs or applications is <span className="text-amber-500 font-bold">prohibited</span>. Maintain focus on the test window.
                                </p>
                                <div className="mb-8 inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                                    <span className="text-amber-400 font-black">Warning {totalViolations} / 3</span>
                                </div>
                            </>
                        )}
                        <button onClick={dismissTabWarning} className={`w-full py-4 rounded-xl font-black text-white text-lg transition-all ${totalViolations >= 3 ? 'bg-red-600 hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]'}`}>
                            {totalViolations >= 3 ? 'View Results' : 'Return to Test'}
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
                                <h2 className="text-3xl font-black text-red-400 mb-4">Test Terminated!</h2>
                                <p className="text-slate-300 text-lg leading-relaxed mb-8">
                                    You exceeded the maximum limit of <span className="text-red-400 font-bold">3 violations</span>. Your test has been automatically submitted.
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
                            {totalViolations >= 3 ? 'View Results' : 'Return to Test'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
