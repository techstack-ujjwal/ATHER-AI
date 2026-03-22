import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, MessageSquare, Layers, Trash2, RefreshCw } from 'lucide-react';

const ADMIN_EMAIL = 'ujjwalrajan2@gmail.com';

type Tab = 'overview' | 'requests' | 'workflows' | 'sales';

export const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [workflows, setWorkflows] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session || session.user.email !== ADMIN_EMAIL) {
        navigate('/');
        return;
      }
      await loadData();
      setLoading(false);
    });
  }, []);

  const loadData = async () => {
    const [{ data: wf }, { data: req }, { data: usr }] = await Promise.all([
      supabase.from('Workflow').select('*').order('createdAt', { ascending: false }),
      supabase.from('CustomBuildRequest').select('*').order('createdAt', { ascending: false }),
      supabase.from('User').select('*').order('createdAt', { ascending: false }),
    ]);
    setWorkflows(wf || []);
    setRequests(req || []);
    setUsers(usr || []);
  };

  const deleteWorkflow = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    await supabase.from('Workflow').delete().eq('id', id);
    setWorkflows(prev => prev.filter(w => w.id !== id));
  };

  const updateRequestStatus = async (id: string, status: string) => {
    await supabase.from('CustomBuildRequest').update({ status }).eq('id', id);
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const totalRevenue = workflows.reduce((sum, w) => sum + (w.price || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-ink/20 border-t-ink rounded-full animate-spin" />
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'requests', label: 'Custom Requests', icon: MessageSquare, badge: requests.filter(r => r.status === 'pending').length },
    { id: 'workflows', label: 'All Workflows', icon: Layers },
  ];

  return (
    <div className="pt-20 min-h-screen bg-surface">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-black tracking-tighter">ADMIN PANEL</h1>
            <p className="text-ink-muted text-sm mt-1">AETHER AI — Internal Dashboard</p>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-10 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-ink text-white' : 'bg-white border border-black/10 text-ink-muted hover:text-ink'}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.badge ? (
                <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{tab.badge}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Total Workflows', value: workflows.length, icon: Layers },
              { label: 'Custom Requests', value: requests.length, icon: MessageSquare },
              { label: 'Total Users', value: users.length, icon: ShoppingBag },
            ].map((stat, i) => (
              <div key={i} className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
                <stat.icon className="w-6 h-6 text-ink-muted mb-4" />
                <p className="text-5xl font-black tracking-tighter mb-2">{stat.value}</p>
                <p className="text-sm text-ink-muted font-medium">{stat.label}</p>
              </div>
            ))}
            <div className="bg-ink text-white rounded-3xl p-8 col-span-full md:col-span-3">
              <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2">Platform Overview</p>
              <p className="text-2xl font-bold">
                {workflows.length} workflows published by {users.length} sellers. {requests.filter(r => r.status === 'pending').length} requests pending your attention.
              </p>
            </div>
          </motion.div>
        )}

        {/* Custom Requests Tab */}
        {activeTab === 'requests' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl border border-black/5 overflow-hidden">
            {requests.length === 0 ? (
              <div className="p-20 text-center text-ink-muted">No requests yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-black/5">
                  <tr>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Email</th>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Details</th>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Date</th>
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req, i) => (
                    <tr key={req.id} className={`border-b border-black/5 ${i % 2 === 0 ? '' : 'bg-surface/30'}`}>
                      <td className="p-5 font-medium">{req.email}</td>
                      <td className="p-5 text-ink-muted max-w-xs truncate">{req.details}</td>
                      <td className="p-5 text-ink-muted whitespace-nowrap">{new Date(req.createdAt).toLocaleDateString()}</td>
                      <td className="p-5">
                        <select
                          value={req.status}
                          onChange={e => updateRequestStatus(req.id, e.target.value)}
                          className={`text-xs font-bold px-3 py-1 rounded-full border outline-none cursor-pointer ${req.status === 'pending' ? 'bg-amber-50 border-amber-200 text-amber-700' : req.status === 'completed' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-surface border-black/10 text-ink-muted'}`}
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </motion.div>
        )}

        {/* All Workflows Tab */}
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
                    <th className="p-5 text-left font-bold text-ink-muted text-xs uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {workflows.map((wf, i) => (
                    <tr key={wf.id} className={`border-b border-black/5 ${i % 2 === 0 ? '' : 'bg-surface/30'}`}>
                      <td className="p-5 font-bold max-w-xs truncate">{wf.title}</td>
                      <td className="p-5">
                        <span className="text-xs font-bold bg-surface px-3 py-1 rounded-full">{wf.category}</span>
                      </td>
                      <td className="p-5 font-bold">${wf.price}</td>
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
