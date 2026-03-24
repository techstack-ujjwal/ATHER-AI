import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Search, Filter, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { WorkflowCard } from '../components/WorkflowCard';
import { supabase } from '../lib/supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';

export const Explore = () => {
  const categories = ["All", "Productivity", "Marketing", "Design", "Data", "Finance", "Legal"];
  
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);
  const initialQuery = queryParams.get('q') || '';

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState("All");
  const [visibleCount, setVisibleCount] = useState(6);

  useEffect(() => {
    async function fetchWorkflows() {
      setLoading(true);
      try {
        let query = supabase
          .from('Workflow')
          .select('*')
          .order('createdAt', { ascending: false });
        
        if (activeCategory !== "All") {
          query = query.eq('category', activeCategory);
        }
        if (searchQuery) {
          query = query.ilike('title', `%${searchQuery}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        const mappedData = (data || []).map((w: any) => ({
          ...w,
          rating: 4.8,
          sales: Math.floor(Math.random() * 100).toString(),
        }));

        setWorkflows(mappedData);

        // Fetch User Plan if logged in
        const localSessionStr = localStorage.getItem('sb-fvywzznegjfmlaqodfoj-auth-token');
        if (localSessionStr) {
          const sessionData = JSON.parse(localSessionStr);
          const userId = sessionData.user.id;
          const fallbackPlan = sessionData.user.user_metadata?.plan || 'Free';
          
          const { data: userData } = await supabase
            .from('User')
            .select('plan')
            .eq('id', userId)
            .single();
            
          setUserPlan(userData?.plan || fallbackPlan);
        }
      } catch (err) {
        console.error("Failed to load workflows:", err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchWorkflows();
  }, [searchQuery, activeCategory]);

  return (
    <div className="pt-20 min-h-screen bg-white">
      <header className="px-6 md:px-12 py-20 border-b border-black/5">
        <div className="max-w-7xl mx-auto">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-7xl font-black tracking-tighter mb-8"
          >
            THE WORKFLOW <br />
            <span className="text-ink-muted">REPOSITORY.</span>
          </motion.h1>
          
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-grow w-full">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-muted" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Triggers the useEffect
                    setSearchQuery(e.currentTarget.value);
                  }
                }}
                placeholder="Search by keyword, creator, or category..." 
                className="w-full bg-surface border border-black/5 rounded-full py-5 pl-16 pr-6 text-lg outline-none focus:border-ink transition-colors"
              />
            </div>
            <button className="flex items-center gap-2 bg-ink text-white px-8 py-5 rounded-full font-bold hover:opacity-90 transition-opacity w-full md:w-auto justify-center">
              <Filter className="w-4 h-4" /> Filters
            </button>
          </div>
        </div>
      </header>

      <main className="px-6 md:px-12 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap gap-3 mb-12">
            {categories.map((cat) => (
              <motion.button 
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-6 py-2 rounded-full text-sm font-bold transition-all
                  ${activeCategory === cat ? "bg-ink text-white" : "bg-surface text-ink-muted hover:bg-surface-container-highest"}
                `}
              >
                {cat}
              </motion.button>
            ))}
            
            <div className="ml-auto flex gap-4">
              <button className="flex items-center gap-2 text-sm font-bold text-ink-muted hover:text-ink">
                Complexity <ChevronDown className="w-4 h-4" />
              </button>
              <button className="flex items-center gap-2 text-sm font-bold text-ink-muted hover:text-ink">
                Price Range <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {loading ? (
              <div className="col-span-full py-20 text-center">
                <div className="w-8 h-8 mx-auto border-4 border-ink/20 border-t-ink rounded-full animate-spin mb-4" />
                <p className="text-ink-muted font-bold">Loading workflows from database...</p>
              </div>
            ) : workflows.length === 0 ? (
              <div className="col-span-full py-32 text-center flex flex-col items-center">
                <div className="w-20 h-20 bg-surface rounded-[2.5rem] flex items-center justify-center mb-6">
                  <Search className="w-8 h-8 text-ink/20" />
                </div>
                <h3 className="text-2xl font-black tracking-tighter mb-2">NO WORKFLOWS FOUND</h3>
                <p className="text-ink-muted max-w-xs mx-auto text-sm leading-relaxed">
                  We couldn't find anything matching "{searchQuery}". Try a different category or broader keywords.
                </p>
                <button 
                  onClick={() => { setSearchQuery(""); setActiveCategory("All"); }}
                  className="mt-8 text-xs font-bold uppercase tracking-widest text-ink hover:underline"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              workflows.slice(0, visibleCount).map((workflow, i) => {
                const numericPrice = Number(workflow.price) || 0;
                return (
                  <WorkflowCard 
                    key={workflow.id || i}
                    id={workflow.id}
                    title={workflow.title}
                    description={workflow.description}
                    category={workflow.category}
                    complexity={workflow.complexity}
                    price={numericPrice}
                    imageUrl={workflow.imageUrl}
                  />
                );
              })
            )}
          </div>
          
          <div className="mt-20 flex justify-center">
            {visibleCount < workflows.length && (
              <motion.button 
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => setVisibleCount(v => v + 6)}
                className="bg-white border border-black/10 px-12 py-4 rounded-full font-bold hover:shadow-xl transition-all duration-300"
              >
                Load More Workflows
              </motion.button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
