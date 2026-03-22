import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Zap, Shield, Globe, Sparkles, X } from 'lucide-react';
import { WorkflowCard } from '../components/WorkflowCard';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export const Home = () => {
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customEmail, setCustomEmail] = useState("");
  const [customDetails, setCustomDetails] = useState("");
  const [customStatus, setCustomStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomStatus("submitting");
    try {
      const { error } = await supabase.from('CustomBuildRequest').insert([{ email: customEmail, details: customDetails }]);
      if (error) throw error;
      setCustomStatus("success");
      setTimeout(() => {
        setShowCustomModal(false);
        setCustomStatus("idle");
        setCustomEmail("");
        setCustomDetails("");
      }, 2500);
    } catch (err) {
      console.error(err);
      setCustomStatus("error");
    }
  };

  const [featuredWorkflows, setFeaturedWorkflows] = useState<any[]>([]);
  const [stats, setStats] = useState({ workflows: 0, users: 0 });
  const [userPlan, setUserPlan] = useState<string | null>(null);

  useEffect(() => {
    // Fetch plan
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserPlan(session.user.user_metadata?.plan || null);
    });
    // Fetch featured workflows
    supabase
      .from('Workflow')
      .select('id, title, category, price, complexity, imageUrl, description')
      .order('createdAt', { ascending: false })
      .limit(3)
      .then(({ data }) => setFeaturedWorkflows(data || []));

    // Fetch stats
    Promise.all([
      supabase.from('Workflow').select('*', { count: 'exact', head: true }),
      supabase.from('User').select('*', { count: 'exact', head: true })
    ]).then(([wf, usr]) => {
      setStats({
        workflows: wf.count || 0,
        users: usr.count || 0
      });
    });
  }, []);

  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="px-6 md:px-12 py-24 md:py-32 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 bg-surface px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-8"
        >
          <Sparkles className="w-3 h-3" />
          The Digital Curator
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-5xl md:text-8xl font-black tracking-tighter leading-[0.9] mb-8 max-w-4xl"
        >
          THE EASY WAY TO <br />
          <span className="text-ink-muted">AUTOMATE.</span>
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg md:text-xl text-ink-muted max-w-2xl mb-12"
        >
          Access a curated repository of high-performance AI workflows. 
          Built by experts, deployed in seconds.
        </motion.p>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col md:flex-row gap-4 items-center"
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link to="/explore" className="bg-ink text-white px-8 py-4 rounded-full font-bold flex items-center gap-2 hover:shadow-xl transition-all duration-300">
              Explore Repository <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link to="/sell" className="bg-white border border-black/10 px-8 py-4 rounded-full font-bold hover:shadow-xl transition-all duration-300">
              Become a Seller
            </Link>
          </motion.div>
          <motion.button 
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => setShowCustomModal(true)} 
            className="bg-surface border border-black/10 text-ink px-8 py-4 rounded-full font-bold hover:shadow-xl hover:bg-white transition-all duration-300 flex items-center gap-2"
          >
            Request Custom Build <Zap className="w-4 h-4 text-yellow-500" />
          </motion.button>
        </motion.div>
      </section>

      {/* Bento Grid Features */}
      <section className="px-6 md:px-12 py-24 bg-surface-container-low">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl md:text-5xl font-black tracking-tighter mb-4">CURATED EXCELLENCE</h2>
              <p className="text-ink-muted max-w-md">Every workflow is rigorously tested for performance and reliability.</p>
            </div>
            <Link to="/explore" className="hidden md:flex items-center gap-2 font-bold text-sm hover:underline">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredWorkflows.length === 0 ? (
              <div className="col-span-3 py-16 text-center text-ink-muted font-bold">
                No workflows yet — <Link to="/sell" className="underline">be the first to publish one!</Link>
              </div>
            ) : (
              featuredWorkflows.map((wf) => (
                <WorkflowCard
                  key={wf.id}
                  id={wf.id}
                  title={wf.title}
                  category={wf.category}
                  price={Number(wf.price) || 0}
                  complexity={wf.complexity}
                  imageUrl={wf.imageUrl}
                  description={wf.description}
                  isLocked={(Number(wf.price) || 0) > 0 && !userPlan}
                />
              ))
            )}
          </div>
        </div>
      </section>

      {/* Stats / Trust */}
      <section className="px-6 md:px-12 py-24 border-y border-black/5">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12">
          <div className="text-center">
            <div className="text-4xl font-black mb-2">{stats.users}+</div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">Active Users</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-black mb-2">{stats.workflows}+</div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">Workflows</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-black mb-2">99.9%</div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">Uptime</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-black mb-2">$0</div>
            <div className="text-xs font-bold uppercase tracking-widest text-ink-muted">Creator Earnings</div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 md:px-12 py-32">
        <div className="bg-ink text-white rounded-[3rem] p-12 md:p-24 relative overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-none mb-8">
              CAN'T FIND WHAT <br /> YOU NEED?
            </h2>
            <p className="text-white/60 text-lg mb-12">
              Our custom solutions team can build bespoke AI agents and workflows 
              tailored specifically to your business logic.
            </p>
            <motion.button 
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => setShowCustomModal(true)} 
              className="inline-block bg-white text-ink px-10 py-4 rounded-full font-bold hover:shadow-2xl transition-all duration-300"
            >
              Request Custom Build
            </motion.button>
          </div>
          
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-white rounded-full" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] border border-white rounded-full" />
          </div>
        </div>
      </section>

      <AnimatePresence>
        {showCustomModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white max-w-lg w-full rounded-[2rem] p-10 relative shadow-2xl"
            >
              <button onClick={() => setShowCustomModal(false)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-surface transition-colors">
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="text-3xl font-black tracking-tighter mb-2">CUSTOM BUILD</h3>
              <p className="text-ink-muted text-sm mb-8">Discuss your unique automation requirements with our engineering team.</p>
              
              {customStatus === "success" ? (
                <div className="bg-green-50 text-green-700 p-6 rounded-2xl font-bold flex flex-col items-center justify-center text-center gap-2">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mb-2">✓</div>
                  Request Received!
                  <span className="text-sm font-normal text-green-600 block mt-1">Our team will contact you within 24 hours.</span>
                </div>
              ) : (
                <form onSubmit={handleCustomSubmit} className="space-y-6">
                  {customStatus === "error" && (
                     <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl font-medium">Failed to submit. Are you online?</div>
                  )}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-ink-muted">Email Address</label>
                    <input 
                      type="email" 
                      required
                      value={customEmail}
                      onChange={e => setCustomEmail(e.target.value)}
                      placeholder="hello@company.com" 
                      className="w-full bg-surface border border-black/10 rounded-xl py-4 px-4 outline-none focus:border-ink transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-ink-muted">Project Details</label>
                    <textarea 
                      required
                      value={customDetails}
                      onChange={e => setCustomDetails(e.target.value)}
                      placeholder="Describe the workflow you need built..." 
                      className="w-full bg-surface border border-black/10 rounded-xl py-4 px-4 outline-none focus:border-ink transition-colors min-h-[120px] resize-none"
                    />
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    disabled={customStatus === "submitting"}
                    className="w-full bg-ink text-white py-4 rounded-xl font-bold hover:shadow-xl transition-all duration-300 disabled:opacity-50"
                  >
                    {customStatus === "submitting" ? "Submitting..." : "Send Request"}
                  </motion.button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
