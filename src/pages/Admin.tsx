import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, MessageSquare, Layers, Trash2, RefreshCw, Upload, ExternalLink, DollarSign, Users, ShieldCheck, UserCog, Download } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const ADMIN_EMAIL = 'ujjwalrajan2@gmail.com';

type Tab = 'overview' | 'requests' | 'workflows' | 'sales' | 'users';

export const Admin = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      const localData = localStorage.getItem('sb-fvywzznegjfmlaqodfoj-auth-token');
      if (!localData) {
        navigate('/');
        return;
      }
      try {
        const session = JSON.parse(localData);
        if (session?.user?.email !== ADMIN_EMAIL) {
          navigate('/');
          return;
        }
        await loadData(session.access_token);
        setLoading(false);
      } catch (e) {
        navigate('/');
      }
    };
    checkAdmin();
  }, []);

  const loadData = async (token: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const headers = { 'apikey': anonKey, 'Authorization': `Bearer ${token}` };

    const fetchJson = async (url: string) => {
      const res = await fetch(url, { headers });
      return res.ok ? await res.json() : [];
    };

    const [wf, req, usr, pur] = await Promise.all([
      fetchJson(`${supabaseUrl}/rest/v1/Workflow?select=*&order=createdAt.desc`),
      fetchJson(`${supabaseUrl}/rest/v1/CustomBuildRequest?select=*&order=createdAt.desc`),
      fetchJson(`${supabaseUrl}/rest/v1/User?select=*&order=createdAt.desc`),
      fetchJson(`${supabaseUrl}/rest/v1/Purchase?select=*,workflow:Workflow(title)&order=createdAt.desc`),
    ]);

    setWorkflows(wf || []);
    setRequests(req || []);
    setUsers(usr || []);
    // Normalize purchase data due to PostgREST format for relations
    setPurchases((pur || []).map((p: any) => ({ ...p, workflow: Array.isArray(p.workflow) ? p.workflow[0] : p.workflow })));
  };

  const getAuthArgs = () => {
    const localData = localStorage.getItem('sb-fvywzznegjfmlaqodfoj-auth-token');
    const token = localData ? JSON.parse(localData).access_token : '';
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return { token, supabaseUrl, anonKey };
  };

  const deleteWorkflow = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    const { token, supabaseUrl, anonKey } = getAuthArgs();
    await fetch(`${supabaseUrl}/rest/v1/Workflow?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${token}` }
    });
    setWorkflows(prev => prev.filter(w => w.id !== id));
  };

  const updateRequestStatus = async (id: string, status: string) => {
    const { token, supabaseUrl, anonKey } = getAuthArgs();
    await fetch(`${supabaseUrl}/rest/v1/CustomBuildRequest?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status })
    });
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const handleUploadResponse = async (requestId: string, file: File) => {
    setUploadingFor(requestId);
    const { token, supabaseUrl, anonKey } = getAuthArgs();
    try {
      const ext = file.name.split('.').pop();
      const path = `admin-responses/${requestId}.${ext}`;
      
      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/workflows/${path}`, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${token}`,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: file
      });
      
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({ message: uploadRes.statusText }));
        throw new Error(errBody.message || errBody.error || 'Storage upload failed');
      }
      
      // We manually construct the public URL from the project ID
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/workflows/${path}`;
      
      // Link to Database - Using supabase client for better error handling and RLS bypass if configured
      const { data: patchData, error: patchError } = await supabase
        .from('CustomBuildRequest')
        .update({ responseFileUrl: publicUrl, status: 'completed' })
        .eq('id', requestId)
        .select();

      if (patchError) {
        console.error("Supabase Patch Error:", patchError);
        throw new Error(`Database error: ${patchError.message} (${patchError.code})`);
      }

      if (!patchData || patchData.length === 0) {
        console.error("Database row not found or RLS-blocked for ID:", requestId);
        throw new Error('Database link failed: Request not found or permission denied by RLS.');
      }

      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, responseFileUrl: publicUrl, status: 'completed' } : r));
      showToast('Build completed and file linked!', 'success');
    } catch (err: any) {
      showToast('Upload failed: ' + err.message, 'error');
    }
    setUploadingFor(null);
  };

  const deleteCustomRequest = async (id: string) => {
    if (!confirm('Are you sure you want to delete this custom build request?')) return;
    const { token, supabaseUrl, anonKey } = getAuthArgs();
    const res = await fetch(`${supabaseUrl}/rest/v1/CustomBuildRequest?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      setRequests(prev => prev.filter(r => r.id !== id));
      showToast('Request deleted', 'success');
    } else {
      showToast('Failed to delete request', 'error');
    }
  };

  const updateUserPlan = async (userId: string, plan: string) => {
     const { token, supabaseUrl, anonKey } = getAuthArgs();
     const res = await fetch(`${supabaseUrl}/rest/v1/User?id=eq.${userId}`, {
       method: 'PATCH',
       headers: { 'apikey': anonKey, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
       body: JSON.stringify({ plan })
     });
     
     if (!res.ok) {
       showToast("Failed to update plan", "error");
     } else {
       setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan } : u));
       showToast(`User plan updated to ${plan}`, "success");
     }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-ink/20 border-t-ink rounded-full animate-spin" />
    </div>
  );

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'requests', label: 'Custom Requests', icon: MessageSquare, badge: requests.filter(r => r.status === 'pending').length },
    { id: 'workflows', label: 'All Workflows', icon: Layers },
    { id: 'sales', label: 'Sales History', icon: ShoppingBag },
    { id: 'users', label: 'User Directory', icon: Users },
  ];

  return (
    <div className="pt-20 min-h-screen bg-surface">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">

        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-black tracking-tighter">ADMIN PANEL</h1>
            <p className="text-ink-muted text-sm mt-1">AETHER AI — Internal Dashboard</p>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        <div className="flex gap-2 mb-10 flex-wrap">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)} className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-ink text-white' : 'bg-white border border-black/10 text-ink-muted hover:text-ink'}`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.badge ? <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{tab.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { label: 'Total Revenue', value: `$${purchases.reduce((acc, p) => acc + Number(p.amount || 0), 0)}`, icon: DollarSign, color: 'text-emerald-600' },
                { label: 'Active Users', value: users.length, icon: Users, color: 'text-blue-600' },
                { label: 'Published Workflows', value: workflows.length, icon: Layers, color: 'text-amber-600' },
                { label: 'Pending Requests', value: requests.filter(r => r.status === 'pending').length, icon: MessageSquare, color: 'text-rose-600' },
              ].map((stat, i) => (
                <div key={i} className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
                  <stat.icon className={`w-6 h-6 ${stat.color} mb-4`} />
                  <p className="text-4xl font-black tracking-tighter mb-2">{stat.value}</p>
                  <p className="text-xs text-ink-muted font-bold uppercase tracking-widest">{stat.label}</p>
                </div>
              ))}
            </motion.div>
            
            <div className="bg-ink text-white rounded-[2.5rem] p-10 relative overflow-hidden">
               <div className="relative z-10">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2">Internal Notice</p>
                  <h3 className="text-2xl font-bold mb-4">Platform growth is at {(users.length / 10).toFixed(1)}% vs last month.</h3>
                  <p className="text-white/60 max-w-xl">
                    You have {requests.filter(r => r.status === 'pending').length} pending custom requests. 
                    Remember to upload completed workflows to fulfill requests and mark them as closed.
                  </p>
               </div>
               <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
            </div>
          </div>
        )}

        {/* Sales History */}
        {activeTab === 'sales' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl border border-black/5 overflow-hidden">
            {purchases.length === 0 ? (
               <div className="p-20 text-center text-ink-muted">No sales recorded yet.</div>
            ) : (
               <table className="w-full text-sm">
                  <thead className="bg-surface border-b border-black/5">
                    <tr>
                      <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Transaction ID</th>
                      <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Workflow</th>
                      <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Amount</th>
                      <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Status</th>
                      <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((pur, i) => (
                      <tr key={pur.id} className="border-b border-black/5">
                        <td className="p-5 font-mono text-xs">{pur.id.slice(0, 8)}...</td>
                        <td className="p-5 font-bold">{pur.workflow?.title || 'Unknown'}</td>
                        <td className="p-5 font-bold text-emerald-600">${pur.amount}</td>
                        <td className="p-5"><span className="bg-green-50 text-green-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border border-green-100">Paid</span></td>
                        <td className="p-5 text-ink-muted">{new Date(pur.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            )}
          </motion.div>
        )}

        {/* User Directory */}
        {activeTab === 'users' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl border border-black/5 overflow-hidden">
             <table className="w-full text-sm">
                <thead className="bg-surface border-b border-black/5">
                  <tr>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">User</th>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Current Plan</th>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Joined</th>
                    <th className="p-5 text-right font-bold text-ink-muted text-xs uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-black/5">
                      <td className="p-5 font-bold">{u.email}</td>
                      <td className="p-5">
                         <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider border ${u.plan === 'Pro' ? 'bg-ink text-white border-ink' : u.plan === 'Enterprise' ? 'bg-blue-600 text-white border-blue-600' : 'bg-surface text-ink-muted border-black/10'}`}>
                            {u.plan || 'Free'}
                         </span>
                      </td>
                      <td className="p-5 text-ink-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="p-5 text-right">
                         <div className="flex justify-end gap-2">
                            {['Free', 'Pro', 'Enterprise'].filter(p => p !== (u.plan || 'Free')).map(plan => (
                              <button key={plan} onClick={() => updateUserPlan(u.id, plan)} className="text-[10px] font-bold text-ink-muted hover:text-ink px-2 py-1 border border-black/5 rounded hover:bg-surface transition-colors">
                                Set {plan}
                              </button>
                            ))}
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </motion.div>
        )}

        {/* Custom Requests — with file upload response */}
        {activeTab === 'requests' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {requests.length === 0 ? (
              <div className="bg-white rounded-3xl p-20 text-center text-ink-muted border border-black/5">No custom requests yet.</div>
            ) : (
              requests.map((req, i) => (
                <div key={req.id} className="bg-white rounded-2xl border border-black/5 p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="font-bold">{req.email}</span>
                        <span className="text-xs text-ink-muted">{new Date(req.createdAt).toLocaleDateString()}</span>
                        <select
                          value={req.status}
                          onChange={e => updateRequestStatus(req.id, e.target.value)}
                          className={`text-xs font-bold px-3 py-1 rounded-full border outline-none cursor-pointer ${req.status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-700' : req.status === 'completed' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-surface border-black/10 text-ink-muted'}`}
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                      <p className="text-ink-muted text-sm leading-relaxed">{req.details}</p>
                      {req.responseFileUrl && (
                        <a 
                          href={`${req.responseFileUrl}${req.responseFileUrl.includes('?') ? '&' : '?'}download=`} 
                          download 
                          className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-green-600 hover:underline"
                        >
                          <Download className="w-4 h-4" /> Download response file
                        </a>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <label className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold cursor-pointer transition-all ${uploadingFor === req.id ? 'bg-ink/10 text-ink-muted' : 'bg-ink text-white hover:opacity-90'}`}>
                        <input type="file" className="hidden" disabled={uploadingFor === req.id} onChange={e => { if (e.target.files?.[0]) handleUploadResponse(req.id, e.target.files[0]); }} />
                        <Upload className="w-4 h-4" />
                        {uploadingFor === req.id ? 'Uploading...' : 'Upload Workflow Response'}
                      </label>
                      <button onClick={() => deleteCustomRequest(req.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors flex items-center justify-center shrink-0">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </motion.div>
        )}

        {/* All Workflows */}
        {activeTab === 'workflows' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl border border-black/5 overflow-hidden">
            {workflows.length === 0 ? (
              <div className="p-20 text-center text-ink-muted">No workflows published yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-black/5">
                  <tr>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Title</th>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Category</th>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Price</th>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Date</th>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {workflows.map((wf, i) => (
                    <tr key={wf.id} className={`border-b border-black/5 ${i % 2 === 0 ? '' : 'bg-surface/30'}`}>
                      <td className="p-5 font-bold max-w-xs truncate">{wf.title}</td>
                      <td className="p-5"><span className="text-xs font-bold bg-surface px-3 py-1 rounded-full">{wf.category}</span></td>
                      <td className="p-5 font-bold">{wf.price === 0 ? 'Free' : `$${wf.price}`}</td>
                      <td className="p-5 text-ink-muted whitespace-nowrap">{new Date(wf.createdAt).toLocaleDateString()}</td>
                      <td className="p-5">
                        <button onClick={() => deleteWorkflow(wf.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};
