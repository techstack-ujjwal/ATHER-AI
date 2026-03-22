import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { ShoppingCart, Download, ArrowLeft, Layers, Zap, Check, Trash2 } from 'lucide-react';

export const WorkflowDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
    });

    if (id) {
      supabase.from('Workflow').select('*').eq('id', id).single().then(({ data }) => {
        setWorkflow(data);
        setLoading(false);
      });
    }
  }, [id]);

  const addToCart = () => {
    if (!workflow) return;
    const stored = localStorage.getItem('aether_cart');
    const cart = stored ? JSON.parse(stored) : [];
    if (!cart.find((item: any) => item.id === workflow.id)) {
      cart.push({ id: workflow.id, title: workflow.title, category: workflow.category, price: workflow.price, imageUrl: workflow.imageUrl, description: workflow.description });
      localStorage.setItem('aether_cart', JSON.stringify(cart));
      window.dispatchEvent(new Event('cart-updated'));
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const deleteWorkflow = async () => {
    if (!confirm('Delete this workflow permanently?')) return;
    await supabase.from('Workflow').delete().eq('id', workflow.id);
    navigate('/explore');
  };

  const isOwner = currentUser && workflow && currentUser.id === workflow.sellerId;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-ink/20 border-t-ink rounded-full animate-spin" />
    </div>
  );

  if (!workflow) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-2xl font-black mb-4">Workflow not found</p>
        <button onClick={() => navigate('/explore')} className="bg-ink text-white px-6 py-3 rounded-full font-bold">Back to Explore</button>
      </div>
    </div>
  );

  const complexityColor = workflow.complexity === 'Low' ? 'text-emerald-600 bg-emerald-50' : workflow.complexity === 'Medium' ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50';

  return (
    <div className="pt-20 min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto px-6 md:px-12 py-12">

        {/* Back button */}
        <button onClick={() => navigate('/explore')} className="flex items-center gap-2 text-ink-muted hover:text-ink transition-colors mb-10 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-bold">Back to Explore</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">

          {/* Left — Image and actions */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl overflow-hidden border border-black/5 shadow-sm mb-6">
              {workflow.imageUrl ? (
                <img src={workflow.imageUrl} alt={workflow.title} className="w-full aspect-[4/3] object-cover" />
              ) : (
                <div className="w-full aspect-[4/3] bg-surface flex items-center justify-center">
                  <span className="text-7xl font-black text-ink/10">{workflow.title?.charAt(0)}</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              {workflow.price === 0 || workflow.price === '0' ? (
                <a href={workflow.fileUrl} download className="w-full bg-ink text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                  <Download className="w-5 h-5" /> Download Free
                </a>
              ) : (
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={addToCart} className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 ${added ? 'bg-green-500 text-white' : 'bg-ink text-white hover:opacity-90'}`}>
                  {added ? <><Check className="w-5 h-5" /> Added to Cart!</> : <><ShoppingCart className="w-5 h-5" /> Add to Cart — ${workflow.price}</>}
                </motion.button>
              )}
              {isOwner && (
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={deleteWorkflow} className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 bg-red-50 text-red-500 hover:bg-red-100 transition-colors border border-red-100">
                  <Trash2 className="w-4 h-4" /> Delete My Workflow
                </motion.button>
              )}
            </div>
          </div>

          {/* Right — Details */}
          <div className="lg:col-span-3">
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="bg-white border border-black/10 text-xs font-bold px-4 py-2 rounded-full uppercase tracking-wider">{workflow.category}</span>
              <span className={`text-xs font-bold px-4 py-2 rounded-full uppercase tracking-wider ${complexityColor}`}>{workflow.complexity}</span>
              {(workflow.price === 0 || workflow.price === '0') && (
                <span className="bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-full uppercase tracking-wider">FREE</span>
              )}
            </div>

            <h1 className="text-4xl font-black tracking-tighter mb-4">{workflow.title}</h1>

            <p className="text-ink-muted leading-relaxed mb-8 text-lg">{workflow.description}</p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-white rounded-2xl p-6 border border-black/5">
                <Layers className="w-5 h-5 text-ink-muted mb-2" />
                <p className="font-black text-2xl">{workflow.complexity}</p>
                <p className="text-xs text-ink-muted font-bold uppercase tracking-widest mt-1">Complexity</p>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-black/5">
                <Zap className="w-5 h-5 text-ink-muted mb-2" />
                <p className="font-black text-2xl">{workflow.price === 0 ? 'Free' : `$${workflow.price}`}</p>
                <p className="text-xs text-ink-muted font-bold uppercase tracking-widest mt-1">Price</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-black/5">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-3">What's included</p>
              <ul className="space-y-2 text-sm text-ink-muted">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Workflow configuration file (.json / .yaml)</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Full setup instructions in description</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Compatible with major AI automation platforms</li>
              </ul>
            </div>

            <p className="text-xs text-ink-muted mt-6">Published {new Date(workflow.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
