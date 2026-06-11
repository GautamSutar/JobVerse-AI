import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Video, Mic, Wifi, LayoutDashboard, Briefcase, Calendar, Clock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const InterviewWarning = () => {
    const { id: scheduleId } = useParams();
    const navigate = useNavigate();

    const [schedule, setSchedule] = useState(null);
    const [loading, setLoading] = useState(true);
    const [resumes, setResumes] = useState([]);
    const [selectedResumeId, setSelectedResumeId] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [scheduleRes, resumesRes] = await Promise.all([
                    api.get(`/interviews/schedules/${scheduleId}/`),
                    api.get('/resumes/')
                ]);
                setSchedule(scheduleRes.data);
                const resumeData = resumesRes.data;
                const fetchedResumes = Array.isArray(resumeData) ? resumeData : (resumeData.results || []);
                setResumes(fetchedResumes);
                if (fetchedResumes.length > 0) {
                    setSelectedResumeId(fetchedResumes[0].id);
                }
            } catch (err) {
                toast.error('Failed to load interview details or resumes.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [scheduleId]);

    const handleStart = () => {
        toast.loading('Preparing Interview Environment...', { duration: 1500 });
        
        // Enter fullscreen on user gesture
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(err => console.log(err));
        }
        
        setTimeout(() => {
            navigate(`/student/interview/${scheduleId}`, { state: { resumeId: selectedResumeId } });
        }, 1500);
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-500">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm">Loading interview details...</p>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto my-12 p-8 bg-black border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden">
            {/* Ambient glows */}
            <div className="absolute top-0 right-0 w-[30rem] h-[30rem] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none transform translate-x-1/3 -translate-y-1/3" />
            <div className="absolute bottom-0 left-0 w-[20rem] h-[20rem] bg-red-500/10 rounded-full blur-[80px] pointer-events-none transform -translate-x-1/2 translate-y-1/2" />
            
            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-start sm:items-center gap-5 border-b border-white/10 pb-6 mb-8">
                    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-500 flex-shrink-0">
                        <AlertTriangle size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight">JobVerse AI Interview Guidelines</h1>
                        <p className="text-slate-400 mt-1">Please read the following instructions carefully before proceeding.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Instructions */}
                    <div className="space-y-6">
                        <h2 className="text-xl font-bold text-white border-b border-white/10 pb-3">Instructions</h2>

                        <div className="bg-[#0a0a0a] p-4 rounded-xl border border-indigo-500/20 flex gap-4 items-start shadow-lg">
                            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                                <LayoutDashboard className="text-indigo-400" size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-200">1. Do Not Switch Tabs</h3>
                                <p className="text-sm text-slate-400 mt-1">This interview is proctored. Any attempt to switch tabs or open other applications will be recorded as a violation.</p>
                            </div>
                        </div>

                        <div className="bg-[#0a0a0a] p-4 rounded-xl border border-indigo-500/20 flex gap-4 items-start shadow-lg">
                            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                                <Wifi className="text-indigo-400" size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-200">2. Stable Internet Connection</h3>
                                <p className="text-sm text-slate-400 mt-1">Disconnections during the AI evaluation may result in an incomplete assessment.</p>
                            </div>
                        </div>

                        <div className="bg-[#0a0a0a] p-4 rounded-xl border border-indigo-500/20 flex gap-4 items-start shadow-lg">
                            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0 gap-1 text-indigo-400">
                                <Video size={16} />
                                <Mic size={16} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-200">3. Camera &amp; Microphone</h3>
                                <p className="text-sm text-slate-400 mt-1">Enable your microphone. The AI will speak questions to you, and you must answer verbally or type your response.</p>
                            </div>
                        </div>

                        <div className="bg-[#0a0a0a] p-4 rounded-xl border border-indigo-500/20 flex gap-4 items-start shadow-lg">
                            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                                <CheckCircle className="text-indigo-400" size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-200">4. Stay in Camera View</h3>
                                <p className="text-sm text-slate-400 mt-1">Do not move away from the screen during the duration of the interview.</p>
                            </div>
                        </div>
                    </div>

                    {/* Interview Info */}
                    <div className="space-y-6 flex flex-col">
                        <h2 className="text-xl font-bold text-white border-b border-white/10 pb-3">Your Interview</h2>

                        {schedule && (
                            <div className="bg-gradient-to-br from-indigo-500/10 to-violet-500/5 rounded-2xl border border-indigo-500/20 p-6 space-y-4 shadow-lg relative overflow-hidden">
                                <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl" />
                                
                                <div className="flex items-center gap-3 text-white font-bold text-lg relative z-10">
                                    <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                                        <Briefcase size={20} className="text-indigo-400" />
                                    </div>
                                    {schedule.job_title || 'AI Interview'}
                                </div>
                                <div className="flex flex-col gap-2 text-sm text-slate-300 relative z-10 bg-black/40 p-4 rounded-xl border border-white/5">
                                    <span className="flex items-center gap-2">
                                        <Calendar size={16} className="text-indigo-400" />
                                        {new Date(schedule.scheduled_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <Clock size={16} className="text-indigo-400" />
                                        {schedule.scheduled_time}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Resume Selection */}
                        <div className="bg-[#0a0a0a] border border-indigo-500/20 rounded-2xl p-5 shadow-lg space-y-3">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                                    <CheckCircle size={16} className="text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-sm">Select Resume for Interview</h3>
                                    <p className="text-xs text-slate-400">The AI will base technical questions on this resume.</p>
                                </div>
                            </div>
                            
                            {resumes.length > 0 ? (
                                <select 
                                    value={selectedResumeId} 
                                    onChange={(e) => setSelectedResumeId(e.target.value)}
                                    className="w-full bg-[#111] border border-slate-700 rounded-xl px-4 py-3 text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
                                >
                                    {resumes.map(r => (
                                        <option key={r.id} value={r.id}>
                                            {r.file?.split('/').pop() || `Resume #${r.id}`}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div className="text-amber-400 text-sm bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                    No resumes found. The AI will use the resume from your job application.
                                </div>
                            )}
                        </div>

                        <div className="flex-1" />

                        {/* Action buttons */}
                        <div className="flex flex-col sm:flex-row gap-4 items-center justify-end pt-6 border-t border-white/10 mt-6">
                            <button
                                onClick={() => navigate('/student/dashboard')}
                                className="w-full sm:w-auto px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-300 font-semibold hover:bg-white/10 hover:text-white transition-all"
                            >
                                Cancel &amp; Return
                            </button>
                            <button
                                onClick={handleStart}
                                className="w-full sm:w-auto px-8 py-3 bg-indigo-600 rounded-xl text-white font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 active:scale-95"
                            >
                                Agree and Start <AlertCircle size={16} className="animate-pulse" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InterviewWarning;
