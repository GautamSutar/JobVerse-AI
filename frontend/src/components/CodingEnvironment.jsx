import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Send, Code, TerminalSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const CodingEnvironment = ({ scheduleId, questionText, onComplete, submittingCode, setSubmittingCode }) => {
    const [code, setCode] = useState('// Write your code here\n');
    const [language, setLanguage] = useState('python');
    const [output, setOutput] = useState('');
    const [error, setError] = useState('');
    const [running, setRunning] = useState(false);

    const languages = [
        { id: 'python', name: 'Python' },
        { id: 'javascript', name: 'JavaScript' },
        { id: 'java', name: 'Java' },
        { id: 'cpp', name: 'C++' }
    ];

    const runCodeLocal = async () => {
        setRunning(true);
        setOutput('Running code...');
        setError('');
        
        try {
            // Test run without submitting as final answer
            // We can hit piston API directly from frontend for dry-runs, or have a backend endpoint.
            // Let's use public piston API for quick dry-runs.
            const pistonLangMap = {
                'python': { lang: 'python', version: '3.10.0' },
                'javascript': { lang: 'javascript', version: '18.15.0' },
                'java': { lang: 'java', version: '15.0.2' },
                'cpp': { lang: 'c++', version: '10.2.0' },
            };
            
            const selectedLang = pistonLangMap[language];
            
            const res = await fetch('https://emkc.org/api/v2/piston/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    language: selectedLang.lang,
                    version: selectedLang.version,
                    files: [{ name: 'main', content: code }]
                })
            });
            
            const data = await res.json();
            if (data.run) {
                setOutput(data.run.stdout);
                setError(data.run.stderr);
            } else {
                setError('Execution failed.');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to execute code. Check your network.');
        } finally {
            setRunning(false);
        }
    };

    const submitCode = async () => {
        setSubmittingCode(true);
        try {
            const res = await api.post(`/interviews/schedules/${scheduleId}/submit-code/`, {
                question: questionText,
                code: code,
                language: language
            });
            toast.success('Code submitted successfully!');
            onComplete(res.data);
        } catch (err) {
            toast.error('Failed to submit code.');
            setSubmittingCode(false);
        }
    };

    return (
        <div className="flex flex-col h-[600px] border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm">
            <div className="flex justify-between items-center bg-gray-100 p-3 border-b border-gray-300">
                <div className="flex items-center gap-2 text-indigo-700 font-bold">
                    <Code size={18} /> Coding Assessment
                </div>
                <div className="flex items-center gap-3">
                    <select 
                        value={language} 
                        onChange={(e) => setLanguage(e.target.value)}
                        className="p-1 border border-gray-300 rounded text-sm bg-white"
                    >
                        {languages.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </select>
                    <button 
                        onClick={runCodeLocal} 
                        disabled={running || submittingCode}
                        className="btn-secondary py-1 px-3 text-sm flex items-center gap-1 bg-white"
                    >
                        {running ? 'Running...' : <><Play size={14} /> Run Code</>}
                    </button>
                    <button 
                        onClick={submitCode} 
                        disabled={running || submittingCode}
                        className="btn-primary py-1 px-4 text-sm flex items-center gap-1"
                    >
                        {submittingCode ? 'Submitting...' : <><Send size={14} /> Submit Solution</>}
                    </button>
                </div>
            </div>
            
            <div className="flex flex-1 overflow-hidden">
                <div className="w-2/3 border-r border-gray-300">
                    <Editor
                        height="100%"
                        language={language}
                        theme="vs-dark"
                        value={code}
                        onChange={(value) => setCode(value || '')}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            wordWrap: 'on'
                        }}
                    />
                </div>
                <div className="w-1/3 bg-gray-900 text-gray-100 p-4 flex flex-col font-mono text-sm overflow-hidden">
                    <div className="flex items-center gap-2 text-gray-400 mb-2 font-bold uppercase tracking-wider text-xs">
                        <TerminalSquare size={14} /> Output Terminal
                    </div>
                    <div className="flex-1 overflow-y-auto bg-black p-3 rounded border border-gray-700">
                        {output && <div className="text-green-400 whitespace-pre-wrap mb-2">{output}</div>}
                        {error && <div className="text-red-400 whitespace-pre-wrap">{error}</div>}
                        {!output && !error && <div className="text-gray-500 italic">No output yet. Run your code to see results.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CodingEnvironment;
