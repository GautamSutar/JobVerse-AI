import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Star, User, ChevronDown, X, Calendar, Clock, CheckCircle, XCircle, RefreshCw, FileText, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const STATUS_OPTIONS = ['PENDING', 'REVIEWED', 'SHORTLISTED', 'INTERVIEWING', 'REJECTED', 'ACCEPTED'];
const STATUS_BADGE = { PENDING: 'badge-amber', REVIEWED: 'badge-indigo', SHORTLISTED: 'badge-emerald', REJECTED: 'badge-red', ACCEPTED: 'badge-emerald', INTERVIEWING: 'badge-violet' };

const SCHEDULE_STATUS_CONFIG = {
    Scheduled: { label: 'Awaiting Response', cls: 'bg-amber-500/20 text-amber-400 border border-amber-500/30', icon: Clock },
    Accepted: { label: 'Candidate Accepted', cls: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', icon: CheckCircle },
    Rejected: { label: 'Candidate Declined', cls: 'bg-red-500/20 text-red-400 border border-red-500/30', icon: XCircle },
    Completed: { label: 'Completed', cls: 'bg-slate-500/20 text-slate-400 border border-slate-500/30', icon: CheckCircle },
    Missed: { label: 'Missed', cls: 'bg-red-500/20 text-red-400 border border-red-500/30', icon: XCircle },
};

export default function HRApplications() {
    const location = useLocation();
    const jobId = new URLSearchParams(location.search).get('jobId');

    const [apps, setApps] = useState([]);
    const [schedules, setSchedules] = useState({});  // keyed by application id
    const [filter, setFilter] = useState('ALL');
    const [loading, setLoading] = useState(true);

    const [scheduleModal, setScheduleModal] = useState(null);
    const [reportModal, setReportModal] = useState(null);
    const [scheduleForm, setScheduleForm] = useState({
        interview_type: 'AI',
        round_type: 'AI_SCREENING',
        scheduled_date: '',
        scheduled_time: '',
        meeting_link: ''
    });

    useEffect(() => {
        const fetchAll = async () => {
            const appsEndpoint = jobId ? `/jobs/applications/?job_id=${jobId}` : '/jobs/applications/';
            const [appsRes, schedulesRes] = await Promise.allSettled([
                api.get(appsEndpoint),
                api.get('/interviews/schedules/'),
            ]);
            if (appsRes.status === 'fulfilled') setApps(appsRes.value.data);
            if (schedulesRes.status === 'fulfilled') {
                // Map schedules by application id (latest one wins)
                const map = {};
                for (const s of schedulesRes.value.data) {
                    map[s.application] = s;
                }
                setSchedules(map);
            }
            setLoading(false);
        };
        fetchAll();
    }, []);

    const updateStatus = async (id, status) => {
        try {
            await api.patch(`/jobs/applications/${id}/`, { status });
            setApps(apps.map(a => a.id === id ? { ...a, status } : a));
            toast.success(`Status updated to ${status}`);
        } catch { toast.error('Update failed.'); }
    };

    const confirmSchedule = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                application: scheduleModal.id,
                interview_type: scheduleForm.interview_type,
                round_type: scheduleForm.round_type,
                scheduled_date: scheduleForm.scheduled_date,
                scheduled_time: scheduleForm.scheduled_time,
            };
            if (scheduleForm.meeting_link) payload.meeting_link = scheduleForm.meeting_link;
            const res = await api.post('/interviews/schedules/', payload);
            await api.patch(`/jobs/applications/${scheduleModal.id}/`, { status: 'INTERVIEWING' });
            setApps(apps.map(a => a.id === scheduleModal.id ? { ...a, status: 'INTERVIEWING' } : a));
            setSchedules(prev => ({ ...prev, [scheduleModal.id]: res.data }));
            setScheduleModal(null);
            toast.success('Interview Scheduled and Candidate Notified!');
        } catch (err) {
            console.error(err);
            toast.error('Failed to schedule interview.');
        }
    };

    const filtered = filter === 'ALL' ? apps : apps.filter(a => a.status === filter);

    if (loading) return <div className="text-slate-400 p-10 text-center">Loading…</div>;

    return (
        <div>
            <h1 className="page-title">Applications</h1>
            <p className="page-subtitle">{apps.length} total, {filtered.length} showing</p>

            {/* Filter */}
            <div className="flex flex-wrap gap-2 mb-6">
                {['ALL', ...STATUS_OPTIONS].map(s => (
                    <button key={s} onClick={() => setFilter(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}>
                        {s === 'ALL' ? 'All Applications' : s.charAt(0) + s.slice(1).toLowerCase()}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <div className="card text-center py-16 text-slate-500">No applications found.</div>
            ) : (
                <div className="grid gap-4">
                    {filtered.map(app => {
                        const schedule = schedules[app.id];
                        const schedCfg = schedule ? SCHEDULE_STATUS_CONFIG[schedule.status] : null;
                        const SchedIcon = schedCfg?.icon;
                        return (
                            <div key={app.id} className="card">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">
                                            <User size={18} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-white">{app.applicant_name || `Applicant #${app.user || app.id}`}</p>
                                            {app.applicant_email && <p className="text-xs text-slate-300">{app.applicant_email}</p>}
                                            <p className="text-xs text-slate-400 mt-0.5">Applied for: {app.job_title || `Job #${app.job}`} · {new Date(app.created_at).toLocaleDateString()}</p>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                {app.resume && app.resume_score != null && (
                                                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-400">
                                                        <Star size={12} className="fill-amber-400" />
                                                        Resume Score: {app.resume_score}%
                                                    </span>
                                                )}
                                                {app.resume_url && (
                                                    <button onClick={async (e) => {
                                                        e.preventDefault();
                                                        try {
                                                            // Fetch the file to force generic download instead of viewing
                                                            const res = await fetch(app.resume_url);
                                                            if (res.ok) {
                                                                const blob = await res.blob();
                                                                const url = window.URL.createObjectURL(blob);
                                                                const a = document.createElement('a');
                                                                a.style.display = 'none';
                                                                a.href = url;
                                                                
                                                                // Use applicant name if available, replace spaces with underscores
                                                                const safeName = (app.applicant_name || 'candidate_resume').replace(/\s+/g, '_');
                                                                a.download = `${safeName}.pdf`;
                                                                
                                                                document.body.appendChild(a);
                                                                a.click();
                                                                window.URL.revokeObjectURL(url);
                                                                document.body.removeChild(a);
                                                            } else {
                                                                toast.error("The resume file could not be found on the server. It may have been deleted.");
                                                            }
                                                        } catch (err) {
                                                            toast.error("Failed to download resume file.");
                                                        }
                                                    }} className="flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-2 py-0.5 rounded focus:outline-none">
                                                        <Download size={12} /> Download Resume
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap justify-end">
                                        <span className={`badge ${STATUS_BADGE[app.status] || 'badge-slate'}`}>{app.status}</span>

                                        {/* Schedule response badge */}
                                        {schedCfg && (
                                            <span className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${schedCfg.cls}`}>
                                                <SchedIcon size={12} />
                                                {schedCfg.label}
                                            </span>
                                        )}

                                        {/* show Schedule button if not yet scheduled, or Reschedule if rejected */}
                                        {(!schedule || schedule.status === 'Rejected') && (app.status === 'SHORTLISTED' || app.status === 'PENDING' || app.status === 'INTERVIEWING') && (
                                            <button
                                                onClick={() => { setScheduleModal(app); setScheduleForm({ interview_type: 'AI', round_type: 'AI_SCREENING', scheduled_date: '', scheduled_time: '', meeting_link: '' }); }}
                                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm flex items-center gap-1"
                                            >
                                                {schedule?.status === 'Rejected' ? <><RefreshCw size={11} />Reschedule</> : 'Schedule AI Interview'}
                                            </button>
                                        )}

                                        {schedule?.status === 'COMPLETED' && (
                                            <button
                                                onClick={() => setReportModal(schedule)}
                                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition shadow-sm flex items-center gap-1 border border-indigo-200"
                                            >
                                                <FileText size={11} /> View AI Report
                                            </button>
                                        )}

                                        {/* Schedule date/time chip if scheduled */}
                                        {schedule && (
                                            <span className="flex items-center gap-1.5 text-xs text-slate-400">
                                                <Calendar size={11} />
                                                {new Date(schedule.scheduled_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                <Clock size={11} />
                                                {schedule.scheduled_time}
                                            </span>
                                        )}

                                        <div className="relative">
                                            <select value={app.status} onChange={e => updateStatus(app.id, e.target.value)}
                                                className="appearance-none bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 pr-7 cursor-pointer focus:ring-1 focus:ring-indigo-500">
                                                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Schedule Modal */}
            {scheduleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
                    <div className="card w-full max-w-md bg-slate-800 border border-slate-700 shadow-2xl">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-white font-bold text-lg">Schedule Interview for #{scheduleModal.user || scheduleModal.id}</h2>
                            <button onClick={() => setScheduleModal(null)} className="text-slate-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={confirmSchedule} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Interview Type</label>
                                <select className="input-field" value={scheduleForm.interview_type} onChange={e => setScheduleForm({ ...scheduleForm, interview_type: e.target.value })}>
                                    <option value="AI">AI Interview</option>
                                    <option value="LIVE">Live Interview</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Round Type</label>
                                <select className="input-field" value={scheduleForm.round_type} onChange={e => setScheduleForm({ ...scheduleForm, round_type: e.target.value })}>
                                    <option value="TECHNICAL">Technical Round</option>
                                    <option value="AI_SCREENING">AI Screening</option>
                                    <option value="FINAL">Final Round</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Date</label>
                                    <input type="date" required className="input-field" value={scheduleForm.scheduled_date} onChange={e => setScheduleForm({ ...scheduleForm, scheduled_date: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Time</label>
                                    <input type="time" required className="input-field" value={scheduleForm.scheduled_time} onChange={e => setScheduleForm({ ...scheduleForm, scheduled_time: e.target.value })} />
                                </div>
                            </div>
                            {scheduleForm.interview_type === 'LIVE' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Meeting Link</label>
                                    <input type="url" className="input-field" placeholder="https://meet.google.com/..." value={scheduleForm.meeting_link} onChange={e => setScheduleForm({ ...scheduleForm, meeting_link: e.target.value })} />
                                </div>
                            )}
                            <div className="flex gap-3 justify-end mt-6">
                                <button type="button" onClick={() => setScheduleModal(null)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Schedule</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* AI Report Modal */}
            {reportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto pt-20 pb-20">
                    <div className="card w-full max-w-2xl bg-white border border-gray-200 shadow-2xl relative text-slate-800">
                        <button onClick={() => setReportModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 transition-colors">
                            <X size={24} />
                        </button>
                        
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <Bot className="text-indigo-600" /> AI Interview Report
                        </h2>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-center">
                                <p className="text-xs text-indigo-500 font-bold uppercase tracking-wider mb-1">Overall</p>
                                <p className="text-3xl font-black text-indigo-700">{reportModal.final_score ?? '--'}%</p>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                                <p className="text-xs text-blue-500 font-bold uppercase tracking-wider mb-1">Technical</p>
                                <p className="text-2xl font-bold text-blue-700">{reportModal.technical_score ?? '--'}%</p>
                            </div>
                            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-center">
                                <p className="text-xs text-emerald-500 font-bold uppercase tracking-wider mb-1">Coding</p>
                                <p className="text-2xl font-bold text-emerald-700">{reportModal.coding_score ?? '--'}%</p>
                            </div>
                            <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 text-center">
                                <p className="text-xs text-purple-500 font-bold uppercase tracking-wider mb-1">Soft Skills</p>
                                <p className="text-2xl font-bold text-purple-700">{reportModal.communication_score ?? '--'}%</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-200 pb-2 mb-3">Recommendation</h3>
                                <p className="text-gray-700 leading-relaxed font-medium bg-gray-50 p-3 rounded-lg">{reportModal.recommendation || 'No recommendation available.'}</p>
                            </div>
                            
                            <div>
                                <h3 className="text-sm font-bold text-green-700 uppercase tracking-wider border-b border-green-200 pb-2 mb-3">Strengths</h3>
                                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{reportModal.strengths || 'No strengths recorded.'}</p>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wider border-b border-amber-200 pb-2 mb-3">Areas for Improvement</h3>
                                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{reportModal.weaknesses || 'No weaknesses recorded.'}</p>
                            </div>
                        </div>
                        
                        <div className="mt-8 flex justify-end">
                            <button onClick={() => setReportModal(null)} className="btn-secondary text-gray-600 bg-gray-100 border-gray-200 hover:bg-gray-200">
                                Close Report
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
