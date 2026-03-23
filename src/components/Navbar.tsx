import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Search, ShoppingBag, LogOut, User, Shield, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from '../lib/supabaseClient';
import { useTheme } from '../context/ThemeContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ADMIN_EMAIL = 'ujjwalrajan2@gmail.com';

export const Navbar = () => {
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [cartCount, setCartCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('sb-fvywzznegjfmlaqodfoj-auth-token');
    localStorage.removeItem('aether_cart');
    setUser(null);
    setCartCount(0);
    window.dispatchEvent(new Event('cart-updated'));
    navigate('/login');
  };

  const refreshCartCount = () => {
    const stored = localStorage.getItem('aether_cart');
    setCartCount(stored ? JSON.parse(stored).length : 0);
  };

  useEffect(() => {
    const checkUser = async () => {
      const localData = localStorage.getItem('sb-fvywzznegjfmlaqodfoj-auth-token');
      if (localData) {
        try {
          const session = JSON.parse(localData);
          if (session?.user) {
            setUser(session.user);
            
            // Fetch latest plan using raw fetch
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            const res = await fetch(`${supabaseUrl}/rest/v1/User?id=eq.${session.user.id}&select=plan`, {
              headers: { 'apikey': anonKey, 'Authorization': `Bearer ${session.access_token}` }
            });
            const data = await res.json().catch(() => null);
            if (data && data.length > 0) {
              const fetchedPlan = data[0].plan;
              // Update local state
              setUser((prev: any) => prev ? { ...prev, user_metadata: { ...prev.user_metadata, plan: fetchedPlan } } : null);
              
              // Also sync localStorage so other tabs/reloads get it instantly
              const updatedSession = { ...session, user: { ...session.user, user_metadata: { ...session.user.user_metadata, plan: fetchedPlan } } };
              localStorage.setItem('sb-fvywzznegjfmlaqodfoj-auth-token', JSON.stringify(updatedSession));
            }
          } else {
            setUser(null);
          }
        } catch (e) {
          console.error("Auth check failed", e);
        }
      } else {
        setUser(null);
      }
    };

    checkUser();
    
    // Listen for custom auth updates (e.g. from Pricing page purchase)
    window.addEventListener('auth-updated', checkUser);
    
    refreshCartCount();
    window.addEventListener('cart-updated', refreshCartCount);

    return () => {
      window.removeEventListener('auth-updated', checkUser);
      window.removeEventListener('cart-updated', refreshCartCount);
    };
  }, []);

  const isAdmin = user?.email === ADMIN_EMAIL;

  const navLinks = [
    { name: 'Explore', path: '/explore' },
    { name: 'Sell', path: '/sell' },
    { name: 'Pricing', path: '/pricing' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass h-20 flex items-center px-6 md:px-12 justify-between">
      <div className="flex items-center gap-12">
        <Link to="/" className="text-2xl font-black tracking-tighter">
          AETHERAI
        </Link>
        
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={cn(
                "text-sm font-medium transition-colors hover:text-ink",
                location.pathname === link.path ? "text-ink" : "text-ink-muted"
              )}
            >
              {link.name}
            </Link>
          ))}
          {isAdmin && (
            <Link to="/admin" className={cn("text-sm font-medium transition-colors hover:text-ink flex items-center gap-1", location.pathname === '/admin' ? "text-ink" : "text-ink-muted")}>
              <Shield className="w-3 h-3" /> Admin
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center bg-surface px-4 py-2 rounded-full border border-black/5">
          <Search className="w-4 h-4 text-ink-muted" />
          <input 
            type="text" 
            placeholder="Search workflows..." 
            className="bg-transparent border-none outline-none text-sm ml-2 w-48"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                navigate(`/explore?q=${e.currentTarget.value}`);
              }
            }}
          />
        </div>
        
        <Link to="/cart" className="p-2 hover:bg-surface rounded-full transition-colors relative">
          <ShoppingBag className="w-5 h-5" />
          {cartCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 bg-ink text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center"
            >
              {cartCount}
            </motion.span>
          )}
        </Link>
        
        <button 
          onClick={toggleTheme}
          className="p-2 hover:bg-surface rounded-full transition-colors group relative"
          aria-label="Toggle theme"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={theme}
              initial={{ y: 20, opacity: 0, rotate: 45 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: -20, opacity: 0, rotate: -45 }}
              transition={{ duration: 0.2 }}
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </motion.div>
          </AnimatePresence>
        </button>

        {user ? (
          <div className="hidden md:flex items-center gap-3">
             <div className="relative group">
                <button className="flex items-center gap-2 p-1 pl-3 bg-surface border border-black/10 rounded-full hover:bg-white transition-all duration-300 group">
                  <span className="text-xs font-bold text-ink-muted group-hover:text-ink transition-colors">
                    {user.user_metadata?.plan || 'Free Plan'}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-ink text-white flex items-center justify-center font-bold text-xs">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                </button>
                
                {/* Desktop Dropdown */}
                <div className="absolute top-full right-0 mt-2 w-64 bg-white/80 dark:bg-surface/80 backdrop-blur-xl border border-black/5 dark:border-white/10 rounded-[2rem] p-6 shadow-2xl opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-300">
                  <div className="mb-4 pb-4 border-b border-black/5 dark:border-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1">Account</p>
                    <p className="text-sm font-bold truncate">{user.email}</p>
                    <div className="mt-2 inline-block px-3 py-1 bg-ink text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                      {user.user_metadata?.plan || 'Free'} Plan
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <Link to="/profile" className="flex items-center gap-3 p-2 hover:bg-surface rounded-xl text-sm font-bold transition-colors">
                      <User className="w-4 h-4 text-ink-muted" /> Profile
                    </Link>
                    {isAdmin && (
                      <Link to="/admin" className="flex items-center gap-3 p-2 hover:bg-surface rounded-xl text-sm font-bold transition-colors">
                        <Shield className="w-4 h-4 text-ink-muted" /> Admin Panel
                      </Link>
                    )}
                    <button 
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 p-2 hover:bg-rose-50 hover:text-rose-600 rounded-xl text-sm font-bold transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </div>
             </div>
          </div>
        ) : (
          <Link 
            to="/login"
            className="hidden md:flex items-center justify-center bg-ink text-white px-8 py-2.5 rounded-full text-sm font-bold hover:shadow-xl transition-all duration-300"
          >
            Login
          </Link>
        )}

        <button 
          className="md:hidden p-2"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X /> : <Menu />}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-0 right-0 bg-white dark:bg-surface border-b border-black/5 p-6 flex flex-col gap-4 md:hidden"
          >
            <div className="flex items-center justify-between pb-4 border-b border-black/5 mb-2">
              <span className="text-sm font-bold uppercase tracking-wider text-ink-muted">Theme</span>
              <button 
                onClick={toggleTheme}
                className="flex items-center gap-2 px-4 py-2 bg-surface rounded-full text-xs font-bold"
              >
                {theme === 'light' ? (
                  <><Moon className="w-4 h-4" /> Dark Mode</>
                ) : (
                  <><Sun className="w-4 h-4" /> Light Mode</>
                )}
              </button>
            </div>
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setIsOpen(false)}
                className="text-lg font-medium"
              >
                {link.name}
              </Link>
            ))}
            {isAdmin && (
              <Link to="/admin" onClick={() => setIsOpen(false)} className="text-lg font-medium flex items-center gap-2">
                <Shield className="w-4 h-4" /> Admin
              </Link>
            )}
            {user ? (
              <>
                <Link to="/profile" onClick={() => setIsOpen(false)} className="text-lg font-medium flex items-center gap-2">
                  <User className="w-4 h-4" /> My Profile
                </Link>
                <button 
                  onClick={() => { handleSignOut(); setIsOpen(false); }}
                  className="bg-surface border border-black/10 text-ink px-6 py-3 rounded-full text-sm font-semibold w-full text-center flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </>
            ) : (
              <>
                <Link 
                  to="/login"
                  onClick={() => setIsOpen(false)}
                  className="bg-surface border border-black/10 text-ink px-6 py-3 rounded-full text-sm font-semibold w-full text-center"
                >
                  Login
                </Link>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
