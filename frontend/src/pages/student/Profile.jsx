import { useEffect, useState } from 'react';
import { Edit3, Save, X, MapPin, Briefcase, GraduationCap, Code, Link as LinkIcon, Github, Linkedin, Award, LayoutDashboard, User } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function StudentProfile({ user, setUser }) {
    const [profile, setProfile] = useState(user || {});
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [skillInput, setSkillInput] = useState('');

    useEffect(() => { setProfile(user || {}); }, [user]);

    const set = (field) => (e) => setProfile(p => ({ ...p, [field]: e.target.value }));

    const handleSave = async () => {
        setSaving(true);
        try {
            const formData = new FormData();
            Object.entries(profile).forEach(([k, v]) => {
                if (v === null || v === undefined || v === '') return;

                if (k === 'skills') {
                    formData.append(k, JSON.stringify(v));
                } else if (k === 'profile_photo') {
                    if (v instanceof File) {
                        formData.append(k, v);
                    }
                } else if (typeof v === 'string' || typeof v === 'number') {
                    formData.append(k, v);
                }
            });
            const { data } = await api.patch('/users/profile/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const updated = { ...user, ...data };
            setUser(updated);
            localStorage.setItem('user', JSON.stringify(updated));
            toast.success('Profile updated successfully!');
            setEditing(false);
        } catch {
            toast.error('Failed to update profile.');
        } finally {
            setSaving(false);
        }
    };

    const addSkill = () => {
        const s = skillInput.trim();
        if (s && !(profile.skills || []).includes(s)) {
            setProfile(p => ({ ...p, skills: [...(p.skills || []), s] }));
            setSkillInput('');
        }
    };

    const removeSkill = (s) => setProfile(p => ({ ...p, skills: (p.skills || []).filter(x => x !== s) }));

    const InputWrap = ({ label, icon: Icon, children }) => (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                {Icon && <Icon size={14} className="text-indigo-400" />}
                {label}
            </label>
            {children}
        </div>
    );

    const glassCardClasses = "bg-[#0a0a0a]/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden";

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20 relative">
            <style>{`
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-up { animation: fadeSlideUp 0.6s ease-out forwards; }
                .delay-100 { animation-delay: 100ms; opacity: 0; }
                .delay-200 { animation-delay: 200ms; opacity: 0; }
                
                .glass-input {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 12px;
                    padding: 12px 16px;
                    color: white;
                    width: 100%;
                    transition: all 0.2s ease;
                }
                .glass-input:focus {
                    background: rgba(99, 102, 241, 0.05);
                    border-color: rgba(99, 102, 241, 0.5);
                    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
                    outline: none;
                }
                .glass-textarea {
                    min-height: 100px;
                    resize: vertical;
                }
            `}</style>

            {/* Glowing background orb */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none -z-10" />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-up">
                <div>
                    <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400 mb-2">My Profile</h1>
                    <p className="text-slate-400 font-medium">Manage your professional identity and portfolio</p>
                </div>
                <div className="flex items-center gap-3">
                    {editing ? (
                        <>
                            <button onClick={() => setEditing(false)} className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold transition-all flex items-center gap-2 border border-white/10">
                                <X size={18} /> Cancel
                            </button>
                            <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-bold transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
                                {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
                                Save Changes
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setEditing(true)} className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold transition-all flex items-center gap-2 border border-white/10 backdrop-blur-sm">
                            <Edit3 size={18} /> Edit Profile
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* ── Left Column: Basic Info & Avatar ── */}
                <div className="lg:col-span-1 space-y-6 animate-fade-up delay-100">
                    <div className={`${glassCardClasses} p-0 overflow-visible`}>
                        {/* Banner */}
                        <div className="h-32 bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 rounded-t-3xl relative overflow-hidden">
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                        </div>
                        
                        {/* Avatar */}
                        <div className="px-6 pb-6 relative">
                            <div className="absolute -top-12 left-6">
                                <div className="w-24 h-24 rounded-2xl bg-[#0a0a0a] p-1.5 shadow-2xl">
                                    <div className="w-full h-full rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl font-black text-white shadow-inner">
                                        {(profile.first_name || profile.username || '?')[0].toUpperCase()}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="pt-16 space-y-5">
                                {editing ? (
                                    <div className="space-y-4">
                                        <InputWrap label="First Name" icon={User}>
                                            <input className="glass-input" value={profile.first_name || ''} onChange={set('first_name')} placeholder="First name" />
                                        </InputWrap>
                                        <InputWrap label="Last Name">
                                            <input className="glass-input" value={profile.last_name || ''} onChange={set('last_name')} placeholder="Last name" />
                                        </InputWrap>
                                        <InputWrap label="Headline" icon={Briefcase}>
                                            <input className="glass-input" value={profile.headline || ''} onChange={set('headline')} placeholder="E.g. Full Stack Developer" />
                                        </InputWrap>
                                        <InputWrap label="Location" icon={MapPin}>
                                            <input className="glass-input" value={profile.location || ''} onChange={set('location')} placeholder="City, Country" />
                                        </InputWrap>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <h2 className="text-2xl font-bold text-white mb-1">
                                                {profile.first_name || profile.last_name ? `${profile.first_name || ''} ${profile.last_name || ''}` : <span className="text-slate-500 italic text-lg">Name not set</span>}
                                            </h2>
                                            <p className="text-indigo-400 font-medium flex items-center gap-2">
                                                <Briefcase size={16} />
                                                {profile.headline || <span className="text-slate-500 italic">Headline not set</span>}
                                            </p>
                                        </div>
                                        
                                        <div className="pt-4 border-t border-white/10 space-y-3">
                                            <div className="flex items-center gap-3 text-slate-300">
                                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400"><MapPin size={16} /></div>
                                                <span className="text-sm">{profile.location || <span className="text-slate-500 italic">Location not set</span>}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-slate-300">
                                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400"><GraduationCap size={16} /></div>
                                                <span className="text-sm">{profile.college_name || <span className="text-slate-500 italic">College not set</span>}</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Social / Links */}
                    <div className={glassCardClasses}>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-5">
                            <LinkIcon size={20} className="text-indigo-400" /> Web Links
                        </h3>
                        <div className="space-y-4">
                            {editing ? (
                                <>
                                    <InputWrap label="LinkedIn URL" icon={Linkedin}>
                                        <input className="glass-input" type="url" value={profile.linkedin_url || ''} onChange={set('linkedin_url')} placeholder="https://linkedin.com/in/..." />
                                    </InputWrap>
                                    <InputWrap label="GitHub URL" icon={Github}>
                                        <input className="glass-input" type="url" value={profile.github_url || ''} onChange={set('github_url')} placeholder="https://github.com/..." />
                                    </InputWrap>
                                </>
                            ) : (
                                <>
                                    <a href={profile.linkedin_url || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/30 transition-all group">
                                        <Linkedin size={20} className={profile.linkedin_url ? 'text-[#0A66C2]' : 'text-slate-600'} />
                                        <span className={`text-sm font-medium truncate ${profile.linkedin_url ? 'text-slate-200 group-hover:text-indigo-300' : 'text-slate-600'}`}>
                                            {profile.linkedin_url || 'Not set'}
                                        </span>
                                    </a>
                                    <a href={profile.github_url || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 transition-all group">
                                        <Github size={20} className={profile.github_url ? 'text-white' : 'text-slate-600'} />
                                        <span className={`text-sm font-medium truncate ${profile.github_url ? 'text-slate-200 group-hover:text-purple-300' : 'text-slate-600'}`}>
                                            {profile.github_url || 'Not set'}
                                        </span>
                                    </a>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Right Column: Details & Narrative ── */}
                <div className="lg:col-span-2 space-y-6 animate-fade-up delay-200">
                    
                    {/* Skills & Experience */}
                    <div className={glassCardClasses}>
                        <div className="flex items-center gap-2 mb-6">
                            <Code size={22} className="text-indigo-400" />
                            <h3 className="text-xl font-bold text-white">Skills & Experience</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <InputWrap label="Years of Experience" icon={Briefcase}>
                                {editing ? (
                                    <input className="glass-input" type="number" value={profile.years_of_experience || ''} onChange={set('years_of_experience')} />
                                ) : (
                                    <div className="text-3xl font-black text-white mt-1">
                                        {profile.years_of_experience ?? 0} <span className="text-base text-slate-500 font-medium">Years</span>
                                    </div>
                                )}
                            </InputWrap>
                            {editing && (
                                <InputWrap label="College / University" icon={GraduationCap}>
                                    <input className="glass-input" value={profile.college_name || ''} onChange={set('college_name')} placeholder="College Name" />
                                </InputWrap>
                            )}
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Technical Skills</label>
                            <div className="flex flex-wrap gap-2 mb-4">
                                {(profile.skills || []).map(s => (
                                    <span key={s} className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium flex items-center gap-2 hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all">
                                        {s}
                                        {editing && (
                                            <button onClick={() => removeSkill(s)} className="w-5 h-5 rounded-md bg-indigo-500/20 flex items-center justify-center hover:bg-red-500/40 hover:text-red-200 transition-colors">
                                                <X size={12} />
                                            </button>
                                        )}
                                    </span>
                                ))}
                                {(profile.skills || []).length === 0 && <span className="text-slate-500 italic text-sm">No skills added yet.</span>}
                            </div>
                            
                            {editing && (
                                <div className="flex gap-2">
                                    <input 
                                        className="glass-input flex-1" 
                                        value={skillInput} 
                                        onChange={e => setSkillInput(e.target.value)} 
                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())} 
                                        placeholder="Add a new skill and press Enter" 
                                    />
                                    <button onClick={addSkill} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all">Add</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Narrative Fields */}
                    <div className={glassCardClasses}>
                        <div className="flex items-center gap-2 mb-6">
                            <LayoutDashboard size={22} className="text-indigo-400" />
                            <h3 className="text-xl font-bold text-white">Background & Portfolio</h3>
                        </div>

                        <div className="space-y-6">
                            <InputWrap label="Education Background" icon={GraduationCap}>
                                {editing ? (
                                    <textarea className="glass-input glass-textarea" value={profile.education || ''} onChange={set('education')} placeholder="List your degrees, institutions, and graduation years..." />
                                ) : (
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                                        {profile.education || <span className="text-slate-500 italic">No education details provided.</span>}
                                    </div>
                                )}
                            </InputWrap>

                            <InputWrap label="Key Projects" icon={Code}>
                                {editing ? (
                                    <textarea className="glass-input glass-textarea" value={profile.projects || ''} onChange={set('projects')} placeholder="Describe your main projects, tech stacks used, and outcomes..." />
                                ) : (
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                                        {profile.projects || <span className="text-slate-500 italic">No projects added yet.</span>}
                                    </div>
                                )}
                            </InputWrap>

                            <InputWrap label="Certifications & Awards" icon={Award}>
                                {editing ? (
                                    <textarea className="glass-input glass-textarea" value={profile.certifications || ''} onChange={set('certifications')} placeholder="List any relevant certifications, courses, or achievements..." />
                                ) : (
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                                        {profile.certifications || <span className="text-slate-500 italic">No certifications added.</span>}
                                    </div>
                                )}
                            </InputWrap>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
