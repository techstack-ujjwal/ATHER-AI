import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { motion, AnimatePresence } from 'motion/react';
import { Play, ArrowLeft, Terminal, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface SchemaField {
  name: string;
  label: string;
  type: 'text' | 'longtext' | 'number' | 'select' | 'file';
  options?: string[];
  required?: boolean;
}

interface ExecutionSchema {
  inputs: SchemaField[];
}

export const RunWorkflow = () => {
  const { workflowId } = useParams();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Execution state
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [output, setOutput] = useState<any>(null);

  useEffect(() => {
    const fetchWorkflow = async () => {
      try {
        const { data, error } = await supabase
          .from('Workflow')
          .select('*')
          .eq('id', workflowId)
          .single();

        if (error) throw error;
        setWorkflow(data);

        // Pre-fill default inputs from schema
        if (data?.executionSchema?.inputs) {
          const defaultInputs: Record<string, string> = {};
          data.executionSchema.inputs.forEach((field: SchemaField) => {
            defaultInputs[field.name] = field.options?.[0] || '';
          });
          setInputs(defaultInputs);
        }

      } catch (err: any) {
        console.error("Error fetching workflow:", err);
        setError("Failed to load workflow details.");
      } finally {
        setLoading(false);
      }
    };

    fetchWorkflow();
  }, [workflowId]);

  const handleInputChange = (name: string, value: any) => {
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const executeWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('running');
    setLogs("[System] Initializing execution environment...\n");
    setOutput(null);

    const sandboxUrl = import.meta.env.VITE_SANDBOX_URL;
    
    if (sandboxUrl) {
      // Real Backend Execution
      try {
        setLogs(prev => prev + "[System] Connecting to secure Python sandbox...\n");
        const executionId = crypto.randomUUID();
        
        // 1. Trigger the background execution
        const res = await fetch(`${sandboxUrl}/api/workflows/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('sb-fvywzznegjfmlaqodfoj-auth-token')}`
          },
          body: JSON.stringify({
            execution_id: executionId,
            workflow_id: workflowId, // Use workflowId from useParams
            inputs: inputs // Use inputs state
          })
        });

        if (!res.ok) throw new Error("Failed to connect to Sandbox Engine");
        
        setLogs(prev => prev + "[System] Execution queued. Waiting for results...\n");

        // 2. Poll Supabase for the Execution record updates
        let attempts = 0;
        const pollInterval = setInterval(async () => {
          attempts++;
          const { data, error } = await supabase
            .from('Execution')
            .select('*')
            .eq('id', executionId)
            .single();
            
          if (data && data.logs) {
            setLogs(data.logs); // Update with real streaming logs from DB
          }

          if (data && (data.status === 'success' || data.status === 'failed')) {
            clearInterval(pollInterval);
            setStatus(data.status === 'success' ? 'completed' : 'error');
            if (data.output) setOutput(data.output);
          } else if (attempts > 30) { // 60 seconds timeout (2s intervals)
            clearInterval(pollInterval);
            setStatus('error');
            setLogs(prev => prev + "\n[Error] Execution timed out.");
          }
        }, 2000);

      } catch (err: any) {
        setStatus('error');
        setLogs(prev => prev + `\n[Error] ${err.message}`);
      }

    } else {
      // Mock Execution Fallback
      setLogs(prev => prev + "[System] Mock mode active (VITE_SANDBOX_URL not set).\n");
      const steps = [
        "[System] Validating inputs...",
        "[Process] Allocating memory...",
        "[Process] Importing necessary modules...",
        "[Execution] Running core logic...",
        `[Input] Analyzing provided data...`,
        "[Execution] Processing...",
        "[Execution] Finalizing output...",
        "[System] Execution completed successfully in 2.34s."
      ];

      let currentStep = 0;
      const interval = setInterval(() => {
        if (currentStep < steps.length) {
          setLogs(prev => prev + steps[currentStep] + "\n");
          currentStep++;
        } else {
          clearInterval(interval);
          setStatus('completed');
          setOutput({
            result: "This is a mocked output. Set VITE_SANDBOX_URL in your .env file to connect to the real Python sandbox engine.",
            status: "Success",
            confidence_score: 98.4
          });
        }
      }, 600);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="w-10 h-10 text-white animate-spin" />
    </div>
  );

  if (error || !workflow) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-6">
      <XCircle className="w-16 h-16 text-red-500 mb-4" />
      <h2 className="text-2xl font-bold mb-2">Workflow Not Found</h2>
      <button onClick={() => navigate('/profile')} className="mt-6 px-6 py-2 bg-white text-black rounded-full font-bold">Go Back</button>
    </div>
  );

  const schema: ExecutionSchema = workflow.executionSchema || { inputs: [] };
  const hasSchema = schema.inputs.length > 0;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white/20 pt-20">
      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Header */}
        <button onClick={() => navigate('/profile')} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-8 text-sm font-bold uppercase tracking-widest">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <div className="flex items-start justify-between gap-8 mb-12">
          <div>
            <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tighter">{workflow.title}</h1>
            <p className="text-white/60 text-lg max-w-2xl">{workflow.description}</p>
          </div>
          {workflow.imageUrl && (
            <img src={workflow.imageUrl} alt={workflow.title} className="w-24 h-24 rounded-2xl object-cover bg-white/5 shrink-0 border border-white/10" />
          )}
        </div>

        {/* Main Interface Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Form Inputs */}
          <div className="lg:col-span-5 bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Play className="w-5 h-5 text-white/50" /> Configuration
            </h2>

            {!hasSchema ? (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl text-sm">
                This workflow does not have an execution schema configured yet. The creator needs to update it before it can be run in the browser.
              </div>
            ) : (
              <div className="space-y-6">
                {schema.inputs.map((field) => (
                  <div key={field.name}>
                    <label className="block text-xs font-bold uppercase tracking-widest text-white/50 mb-2">
                      {field.label} {field.required && <span className="text-red-400">*</span>}
                    </label>
                    
                    {field.type === 'longtext' ? (
                      <textarea
                        value={inputs[field.name] || ''}
                        onChange={(e) => handleInputChange(field.name, e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white focus:border-white focus:ring-1 focus:ring-white outline-none transition-all resize-none min-h-[120px]"
                        placeholder={`Enter ${field.label.toLowerCase()}...`}
                      />
                    ) : field.type === 'select' ? (
                      <select
                        value={inputs[field.name] || ''}
                        onChange={(e) => handleInputChange(field.name, e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white focus:border-white focus:ring-1 focus:ring-white outline-none transition-all appearance-none"
                      >
                        {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={inputs[field.name] || ''}
                        onChange={(e) => handleInputChange(field.name, e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-white focus:border-white focus:ring-1 focus:ring-white outline-none transition-all"
                        placeholder={`Enter ${field.label.toLowerCase()}...`}
                      />
                    )}
                  </div>
                ))}

                <button
                  onClick={executeWorkflow}
                  disabled={status === 'running'}
                  className="w-full bg-white text-black py-4 rounded-xl font-black text-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 mt-4 flex items-center justify-center gap-3"
                >
                  {status === 'running' ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Executing...</>
                  ) : (
                    <><Play className="w-5 h-5" /> Run Workflow</>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Terminal & Output */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Terminal Window */}
            <div className="bg-black border border-white/10 rounded-3xl overflow-hidden flex flex-col min-h-[300px] shadow-2xl">
              <div className="bg-white/5 border-b border-white/10 px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                </div>
                <div className="flex-grow text-center text-xs font-mono text-white/40">aether-runtime/execution</div>
              </div>
              <div className="p-6 font-mono text-sm leading-relaxed overflow-y-auto flex-grow flex flex-col gap-1">
                {logs.length === 0 ? (
                  <div className="text-white/20 h-full flex flex-col items-center justify-center flex-grow text-center">
                    <Terminal className="w-8 h-8 mb-2 opacity-20" />
                    Waiting for execution to start...
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`${log.includes('System') ? 'text-blue-400' : 'text-emerald-400'}`}
                    >
                      <span className="text-white/30 mr-2">{new Date().toISOString().split('T')[1].slice(0,-1)}</span>
                      {log}
                    </motion.div>
                  ))
                )}
                {status === 'running' && (
                  <motion.div animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-4 bg-white/50 inline-block mt-1" />
                )}
              </div>
            </div>

            {/* Structured Output Result */}
            <AnimatePresence>
              {output && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-emerald-950/30 border border-emerald-500/20 rounded-3xl p-6 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-3xl rounded-full -mr-20 -mt-20 pointer-events-none"></div>
                  <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Execution Result
                  </h3>
                  <div className="bg-black/40 rounded-xl p-4 font-mono text-sm text-white/80 overflow-x-auto border border-emerald-500/10">
                    <pre>{JSON.stringify(output, null, 2)}</pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
          </div>

        </div>
      </div>
    </div>
  );
};
