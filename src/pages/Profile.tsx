import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Trash2, Edit2, X, Check } from 'lucide-react';

export const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWorkflow, setEditingWorkflow] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate('/login'); return; }
      setUser(session.user);
      const { data } = await supabase
        .from('Workflow')
        .select('*')
        .eq('sellerId', session.user.id)
        .order('createdAt', { ascending: false });
      setWorkflows(data || []);
      setLoading(false);
    });
  }, []);

  const openEdit = (wf: any) => {
    setEditingWorkflow(wf);
    setEditTitle(wf.title);
    setEditDescription(wf.description);
    setEditPrice(String(wf.price));
  };

  const saveEdit = async () => {
    if (!editingWorkflow) return;
    setSaving(true);
    const { error } = await supabase.from('Workflow').update({
      title: editTitle,
      description: editDescription,
      price: parseFloat(editPrice),
    }).eq('id', editingWorkflow.id);
    if (!error) {
      setWorkflows(prev => prev.map(w => w.id === editingWorkflow.id
        ? { ...w, title: editTitle, description: editDescription, price: parseFloat(editPrice) }
        : w
      ));
      setEditingWorkflow(null);
    }
    setSaving(false);
  };

  const deleteWorkflow = async (id: string) => {
    if (!confirm('Delete this workflow permanently?')) return;
    await supabase.from('Workflow').delete().eq('id', id);
    setWorkflows(prev => prev.filter(w => w.id !== id));
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-ink/20 border-t-ink rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="pt-20 min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-12">

        {/* Profile Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-10 border border-black/5 mb-12 flex items-center gap-8">
          <div className="w-20 h-20 bg-ink text-white rounded-full flex items-center justify-center text-3xl font-black">
            {user?.user_metadata?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter">{user?.user_metadata?.full_name || 'Creator'}</h1>
            <p className="text-ink-muted">{user?.email}</p>
            <p className="text-xs text-ink-muted mt-1">Joined {new Date(user?.created_at).toLocaleDateString()}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-4xl font-black">{workflows.length}</p>
            <p className="text-xs text-ink-muted font-bold uppercase tracking-widest">Workflows Published</p>
          </div>
        </motion.div>

        {/* Workflows */}
        <h2 className="text-2xl font-black tracking-tighter mb-6">MY WORKFLOWS</h2>

        {workflows.length === 0 ? (
          <div className="bg-white rounded-3xl p-20 text-center border border-black/5">
            <p className="text-ink-muted font-bold mb-4">You haven't published any workflows yet.</p>
            <button onClick={() => navigate('/sell')} className="bg-ink text-white px-8 py-3 rounded-full font-bold hover:opacity-90 transition-opacity">
              Publish Your First Workflow
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {workflows.map((wf, i) => (
              <motion.div
                key={wf.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-black/5 p-6 flex items-center gap-6"
              >
                {wf.imageUrl ? (
                  <img src={wf.imageUrl} alt={wf.title} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 bg-surface rounded-xl flex items-center justify-center font-black text-2xl text-ink/20 shrink-0">
                    {wf.title?.charAt(0)}
                  </div>
                )}
                <div className="flex-grow min-w-0">
                  <h3 className="font-bold text-lg truncate">{wf.title}</h3>
                  <p className="text-ink-muted text-sm truncate">{wf.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs font-bold bg-surface px-3 py-1 rounded-full">{wf.category}</span>
                    <span className="text-xs font-bold text-ink">${wf.price}</span>
                    <span className="text-xs text-ink-muted">{new Date(wf.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => openEdit(wf)} className="p-3 bg-surface rounded-full hover:bg-surface-container-highest transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => deleteWorkflow(wf.id)} className="p-3 bg-red-50 rounded-full hover:bg-red-100 transition-colors text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingWorkflow && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white max-w-lg w-full rounded-[2rem] p-10 relative shadow-2xl">
              <button onClick={() => setEditingWorkflow(null)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-surface">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-2xl font-black tracking-tighter mb-6">EDIT WORKFLOW</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-ink-muted block mb-2">Title</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-surface border border-black/10 rounded-xl py-3 px-4 outline-none focus:border-ink" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-ink-muted block mb-2">Description</label>
                  <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} className="w-full bg-surface border border-black/10 rounded-xl py-3 px-4 outline-none focus:border-ink min-h-[100px] resize-none" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-ink-muted block mb-2">Price ($)</label>
                  <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="w-full bg-surface border border-black/10 rounded-xl py-3 px-4 outline-none focus:border-ink" />
                </div>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={saveEdit} disabled={saving} className="w-full bg-ink text-white py-4 rounded-xl font-bold hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
