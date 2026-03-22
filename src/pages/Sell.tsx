import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Upload, Plus, Info, Eye, Save, Send } from 'lucide-react';
import { SuccessModal } from '../components/SuccessModal';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

export const Sell = () => {
  const [step, setStep] = useState(1);
  const [showModal, setShowModal] = useState(false);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Marketing');
  const [complexity, setComplexity] = useState('Medium');
  const [price, setPrice] = useState('49');
  const [file, setFile] = useState<File | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const publishWorkflow = async () => {
    try {
      setIsPublishing(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert("You must be logged in to sell a workflow.");
        navigate('/login');
        return;
      }

      let fileUrl = '';
      
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${session.user.id}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('workflows')
          .upload(filePath, file);

        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('workflows')
          .getPublicUrl(filePath);
        
        fileUrl = publicUrl;
      }

      const { error: dbError } = await supabase
        .from('Workflow')
        .insert({
          title,
          description,
          category,
          complexity,
          price: parseFloat(price),
          fileUrl,
          sellerId: session.user.id
        });

      if (dbError) throw dbError;

      setShowModal(true);
    } catch (error: any) {
      alert(`Error publishing workflow: ${error.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="pt-20 min-h-screen bg-surface">
      <div className="flex flex-col lg:flex-row h-[calc(100vh-5rem)]">
        {/* Form Area */}
        <div className="flex-grow overflow-y-auto p-6 md:p-12 lg:p-20 bg-white">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-12">
              {[1, 2, 3].map((s) => (
                <div 
                  key={s}
                  className={`h-1 flex-grow rounded-full transition-colors
                    ${s <= step ? "bg-ink" : "bg-surface-container-highest"}
                  `}
                />
              ))}
            </div>

            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-12"
            >
              {step === 1 && (
                <>
                  <div>
                    <h1 className="text-4xl font-black tracking-tighter mb-4">IDENTITY</h1>
                    <p className="text-ink-muted">Define the core metadata for your workflow.</p>
                  </div>
                  
                  <div className="space-y-8">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-ink-muted">Workflow Title</label>
                      <input 
                        type="text" 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Autonomous Content Engine"
                        className="w-full border-b border-black/10 py-4 text-2xl font-bold outline-none focus:border-ink transition-colors"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-ink-muted">Short Description</label>
                      <textarea 
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Explain what this workflow accomplishes in one sentence..."
                        className="w-full border border-black/10 rounded-2xl p-4 min-h-[100px] outline-none focus:border-ink transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-ink-muted">Category</label>
                        <select 
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full border border-black/10 rounded-full px-6 py-4 outline-none appearance-none bg-white"
                        >
                          <option>Marketing</option>
                          <option>Productivity</option>
                          <option>Design</option>
                          <option>Data</option>
                          <option>Finance</option>
                          <option>Legal</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-ink-muted">Complexity</label>
                        <select 
                          value={complexity}
                          onChange={(e) => setComplexity(e.target.value)}
                          className="w-full border border-black/10 rounded-full px-6 py-4 outline-none appearance-none bg-white"
                        >
                          <option>Low</option>
                          <option>Medium</option>
                          <option>High</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <h1 className="text-4xl font-black tracking-tighter mb-4">MONETIZATION</h1>
                    <p className="text-ink-muted">Set your pricing and license structure.</p>
                  </div>
                  
                  <div className="space-y-8">
                    <div className="bg-surface p-8 rounded-3xl border border-black/5">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold">Standard License</h3>
                        <span className="text-xs font-bold bg-ink text-white px-3 py-1 rounded-full uppercase">Recommended</span>
                      </div>
                      <div className="flex items-end gap-2 mb-8">
                        <span className="text-4xl font-black">$</span>
                        <input 
                          type="number" 
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          className="bg-transparent border-b-2 border-ink text-4xl font-black w-24 outline-none"
                        />
                        <span className="text-ink-muted font-bold mb-1">one-time</span>
                      </div>
                      <ul className="space-y-3 text-sm text-ink-muted">
                        <li className="flex items-center gap-2"><Plus className="w-3 h-3" /> Personal use only</li>
                        <li className="flex items-center gap-2"><Plus className="w-3 h-3" /> Standard support</li>
                        <li className="flex items-center gap-2"><Plus className="w-3 h-3" /> Lifetime updates</li>
                      </ul>
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div>
                    <h1 className="text-4xl font-black tracking-tighter mb-4">LOGIC MANIFEST</h1>
                    <p className="text-ink-muted">Upload your workflow configuration file (JSON/YAML).</p>
                  </div>
                  
                  <div className="space-y-8">
                    <label className="block border-2 border-dashed border-black/10 rounded-[2rem] p-12 flex flex-col items-center text-center hover:bg-surface transition-colors cursor-pointer group">
                      <input type="file" onChange={handleFileChange} className="hidden" accept=".json,.yaml,.yml,.txt" />
                      <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <Upload className="w-6 h-6" />
                      </div>
                      <h3 className="text-lg font-bold mb-2">{file ? file.name : 'Drop your manifest here'}</h3>
                      <p className="text-ink-muted text-sm max-w-xs">
                        Supports .json, .yaml, or .txt files exported from major AI automation platforms.
                      </p>
                    </label>
                    
                    <div className="flex items-start gap-4 p-6 bg-amber-50 rounded-2xl border border-amber-100">
                      <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800">
                        Make sure to remove any sensitive API keys or personal credentials from your manifest before uploading.
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-between pt-12">
                {step > 1 ? (
                  <button 
                    onClick={() => setStep(step - 1)}
                    className="px-8 py-4 rounded-full font-bold text-ink-muted hover:text-ink transition-colors"
                  >
                    Back
                  </button>
                ) : <div />}
                
                {step < 3 ? (
                  <button 
                    onClick={() => setStep(step + 1)}
                    className="bg-ink text-white px-10 py-4 rounded-full font-bold hover:opacity-90 transition-opacity"
                  >
                    Continue
                  </button>
                ) : (
                  <button 
                    onClick={publishWorkflow}
                    disabled={isPublishing || !title || !description || !price}
                    className="bg-ink text-white px-10 py-4 rounded-full font-bold hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
                  >
                    {isPublishing ? "Publishing..." : "Publish Workflow"} <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        <SuccessModal 
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            navigate('/explore');
          }}
          title="Workflow Published"
          message="Your workflow has been successfully submitted to the database and is now live in the repository!"
        />

        {/* Preview Sidebar */}
        <div className="hidden lg:block w-[400px] bg-surface border-l border-black/5 p-12 overflow-y-auto">
          <div className="sticky top-0">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xs font-bold uppercase tracking-widest text-ink-muted">Live Preview</h3>
            </div>

            <div className="bg-white rounded-3xl shadow-xl shadow-black/5 overflow-hidden border border-black/5">
              <div className="aspect-[4/3] bg-surface-container-highest flex items-center justify-center">
                <span className="font-black text-4xl text-ink/20">{title ? title.charAt(0).toUpperCase() : '?'}</span>
              </div>
              <div className="p-8">
                <h3 className="font-bold text-lg leading-tight mb-2 truncate">{title || 'Workflow Title'}</h3>
                <p className="text-ink-muted text-sm mb-6 line-clamp-2">{description || 'Your description will appear here'}</p>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-xs font-bold uppercase tracking-widest bg-surface px-3 py-1 rounded-full">{category}</span>
                  <span className="text-lg font-black">${price || '0'}</span>
                </div>
              </div>
            </div>
            
            <p className="mt-8 text-xs text-center text-ink-muted leading-relaxed">
              This is how your workflow will appear to potential buyers in the repository.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
