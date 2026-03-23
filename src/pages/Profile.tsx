import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Trash2, Edit2, X, Check, ExternalLink } from 'lucide-react';

export const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [publishedWorkflows, setPublishedWorkflows] = useState<any[]>([]);
  const [purchasedWorkflows, setPurchasedWorkflows] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWorkflow, setEditingWorkflow] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const ensureAbsoluteUrl = (url: string) => {
    if (!url) return '#';
    return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
  };

  useEffect(() => {
    const fetchProfileData = async () => {
      const localData = localStorage.getItem('sb-fvywzznegjfmlaqodfoj-auth-token');
      if (!localData) {
        navigate('/login');
        return;
      }
      
      try {
        const session = JSON.parse(localData);
        setUser(session.user);
        
        // Fetch Published Workflows
        const { data: pubData } = await supabase
          .from('Workflow')
          .select('*')
          .eq('sellerId', session.user.id)
          .order('createdAt', { ascending: false });
        
        setPublishedWorkflows(pubData || []);

        // Fetch Purchased Workflows - Defensive check to prevent .map crashes
        const { data: purData } = await supabase
          .from('Purchase')
          .select('*, workflow:Workflow(*)')
          .eq('userId', session.user.id);
        
        if (Array.isArray(purData)) {
          setPurchasedWorkflows(purData.map((p: any) => p.workflow).filter(Boolean));
        }

        // Fetch My Sales
        if (Array.isArray(pubData) && pubData.length > 0) {
          const myWorkflowIds = pubData.map((w: any) => w.id);
          const { data: salesData } = await supabase
            .from('Purchase')
            .select('*, workflow:Workflow(title)')
            .in('workflowId', myWorkflowIds)
            .order('createdAt', { ascending: false });
          
          if (Array.isArray(salesData)) {
            setSales(salesData.map((s: any) => ({ ...s, workflow: Array.isArray(s.workflow) ? s.workflow[0] : s.workflow })));
          }
        }

        // Fetch My Custom Build Requests - Robust email matching
        const userEmail = session.user.email?.toLowerCase().trim();
        const { data: reqData } = await supabase
          .from('CustomBuildRequest')
          .select('*')
          .ilike('email', userEmail)
          .order('createdAt', { ascending: false });
        
        setMyRequests(reqData || []);

      } catch (err) {
        console.error("Profile fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [navigate]);

  const openEdit = (wf: any) => {
    setEditingWorkflow(wf);
    setEditTitle(wf.title);
    setEditDescription(wf.description);
    setEditPrice(String(wf.price));
  };

  const saveEdit = async () => {
    if (!editingWorkflow) return;
    setSaving(true);
    try {
      const localData = localStorage.getItem('sb-fvywzznegjfmlaqodfoj-auth-token');
      const token = localData ? JSON.parse(localData).access_token : '';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/rest/v1/Workflow?id=eq.${editingWorkflow.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          price: parseFloat(editPrice)
        })
      });

      if (res.ok) {
        setPublishedWorkflows(prev => prev.map(w => w.id === editingWorkflow.id
          ? { ...w, title: editTitle, description: editDescription, price: parseFloat(editPrice) }
          : w
        ));
        setEditingWorkflow(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const deleteWorkflow = async (id: string) => {
    if (!confirm('Delete this workflow permanently?')) return;
    try {
      const localData = localStorage.getItem('sb-fvywzznegjfmlaqodfoj-auth-token');
      const token = localData ? JSON.parse(localData).access_token : '';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/rest/v1/Workflow?id=eq.${id}`, {
        method: 'DELETE',
        headers: { 'apikey': anonKey, 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setPublishedWorkflows(prev => prev.filter(w => w.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
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
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-10 border border-black/5 mb-12 flex items-center gap-8 shadow-sm">
          <div className="w-20 h-20 bg-ink text-white rounded-full flex items-center justify-center text-3xl font-black">
            {user?.user_metadata?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter">{user?.user_metadata?.full_name || 'Creator'}</h1>
            <p className="text-ink-muted">{user?.email}</p>
            <p className="text-xs text-ink-muted mt-1">Joined {new Date(user?.created_at).toLocaleDateString()}</p>
          </div>
          <div className="ml-auto flex gap-8 text-right">
             <div>
              <p className="text-4xl font-black">{purchasedWorkflows.length}</p>
              <p className="text-xs text-ink-muted font-bold uppercase tracking-widest">Purchased</p>
             </div>
             <div>
              <p className="text-4xl font-black">{publishedWorkflows.length}</p>
              <p className="text-xs text-ink-muted font-bold uppercase tracking-widest">Published</p>
            </div>
             <div>
              <p className="text-4xl font-black text-emerald-600">${sales.reduce((sum, s) => sum + Number(s.amount || 0), 0).toFixed(2)}</p>
              <p className="text-xs text-emerald-600/60 font-bold uppercase tracking-widest">Earned</p>
            </div>
          </div>
        </motion.div>

        {/* Sales History */}
        {sales.length > 0 && (
          <div className="mb-16">
            <h2 className="text-2xl font-black tracking-tighter mb-6">MY EARNINGS</h2>
            <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-black/5">
                  <tr>
                    <th className="pb-4 font-bold text-ink-muted text-xs uppercase tracking-widest">Workflow Sold</th>
                    <th className="pb-4 font-bold text-ink-muted text-xs uppercase tracking-widest">Date</th>
                    <th className="pb-4 text-right font-bold text-ink-muted text-xs uppercase tracking-widest">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {sales.map(sale => (
                    <tr key={sale.id}>
                      <td className="py-4 font-bold">{sale.workflow?.title || 'Unknown'}</td>
                      <td className="py-4 text-ink-muted">{new Date(sale.createdAt).toLocaleDateString()}</td>
                      <td className="py-4 text-right font-black text-emerald-600">+${sale.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* My Custom Requests */}
        <div className="mb-16">
          <h2 className="text-2xl font-black tracking-tighter mb-6">MY CUSTOM REQUESTS</h2>
          {myRequests.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-black/5">
              <p className="text-ink-muted font-bold mb-4">You haven't requested any custom builds yet.</p>
              <button onClick={() => navigate('/pricing')} className="bg-ink text-white px-8 py-3 rounded-full font-bold hover:opacity-90 transition-opacity">
                Request a Custom Build
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {myRequests.map((req: any, i: number) => (
                <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-grow min-w-0">
                      <p className="font-bold text-sm mb-1 text-ink line-clamp-2">{req.details}</p>
                      <p className="text-xs text-ink-muted">{new Date(req.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider border ${req.status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-700' : req.status === 'completed' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                        {req.status}
                      </span>
                      {req.responseFileUrl && (
                        <a 
                          href={`${req.responseFileUrl}${req.responseFileUrl.includes('?') ? '&' : '?'}download=`} 
                          className="flex items-center gap-2 bg-ink text-white text-xs font-bold px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
                        >
                          Download Workflow
                        </a>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Purchased Workflows */}
        <h2 className="text-2xl font-black tracking-tighter mb-6">MY PURCHASES</h2>
        <div className="mb-16">
          {purchasedWorkflows.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-black/5">
              <p className="text-ink-muted font-bold mb-4">You haven't bought any workflows yet.</p>
              <button onClick={() => navigate('/explore')} className="bg-ink text-white px-8 py-3 rounded-full font-bold hover:opacity-90 transition-opacity">
                Explore Workflows
              </button>
            </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {purchasedWorkflows.map((wf, i) => (
                <motion.div
                  key={`purchased-${wf.id}-${i}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white rounded-2xl border border-black/5 p-6 flex flex-col gap-4 shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    {wf.imageUrl ? (
                      <img src={wf.imageUrl} alt={wf.title} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-16 h-16 bg-surface rounded-xl flex items-center justify-center font-black text-2xl text-ink/20 shrink-0">
                        {wf.title?.charAt(0)}
                      </div>
                    )}
                    <div className="flex-grow min-w-0">
                      <h3 className="font-bold text-lg truncate">{wf.title}</h3>
                      <p className="text-ink-muted text-xs truncate">{wf.description}</p>
                    </div>
                  </div>
                    <div className="grid grid-cols-2 gap-2 mt-auto pt-4 border-t border-black/5">
                       <a 
                         href={`${wf.fileUrl}${wf.fileUrl.includes('?') ? '&' : '?'}download=`} 
                         download 
                         className="text-center bg-ink text-surface py-2 rounded-xl text-xs font-bold hover:opacity-90 transition-opacity"
                       >
                         Download File
                       </a>
                     <button onClick={() => navigate(`/workflow/${wf.id}`)} className="text-center bg-surface border border-ink/10 text-ink py-2 rounded-xl text-xs font-bold hover:bg-surface-container-highest transition-colors">View Details</button>
                     {wf.liveUrl && (
                        <a href={ensureAbsoluteUrl(wf.liveUrl)} target="_blank" rel="noopener noreferrer" className="col-span-2 text-center bg-blue-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                          <ExternalLink className="w-4 h-4" /> Open Live System
                        </a>
                     )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Published Workflows */}
        <h2 className="text-2xl font-black tracking-tighter mb-6">MY PUBLISHED WORKFLOWS</h2>
        <div className="mb-12">
          {publishedWorkflows.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-black/5">
              <p className="text-ink-muted font-bold mb-4">You haven't published any workflows yet.</p>
              <button onClick={() => navigate('/sell')} className="bg-surface text-ink px-8 py-3 border border-black/10 rounded-full font-bold hover:bg-surface-container-highest transition-opacity">
                Publish Your First Workflow
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {publishedWorkflows.map((wf, i) => (
                <motion.div
                  key={`pub-${wf.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white rounded-2xl border border-black/5 p-6 flex items-center gap-6 shadow-sm"
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
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-xs font-bold bg-surface px-3 py-1 rounded-full">{wf.category}</span>
                      <span className="text-xs font-bold text-ink">${wf.price}</span>
                      <span className="text-xs text-ink-muted">{new Date(wf.createdAt).toLocaleDateString()}</span>
                      {wf.liveUrl && (
                        <a href={ensureAbsoluteUrl(wf.liveUrl)} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline">
                          <ExternalLink className="w-3 h-3" /> Live Demo Attached
                        </a>
                      )}
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
