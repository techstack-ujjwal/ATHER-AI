import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Search, ShoppingBag, LogOut, User, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from '../lib/supabaseClient';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ADMIN_EMAIL = 'ujjwalrajan2@gmail.com';

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [cartCount, setCartCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  const refreshCartCount = () => {
    const stored = localStorage.getItem('aether_cart');
    setCartCount(stored ? JSON.parse(stored).length : 0);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    refreshCartCount();
    window.addEventListener('cart-updated', refreshCartCount);

    return () => {
      subscription.unsubscribe();
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

        {user ? (
          <div className="hidden md:flex items-center gap-2">
            <Link to="/profile" className="flex items-center justify-center bg-surface border border-black/10 text-ink p-2 rounded-full text-sm hover:bg-white transition-colors">
              <User className="w-4 h-4" />
            </Link>
            <button 
              onClick={() => supabase.auth.signOut()}
              className="flex items-center justify-center bg-white border border-black/10 text-ink px-6 py-2 rounded-full text-sm font-semibold hover:bg-surface transition-colors gap-2"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        ) : (
          <>
            <Link 
              to="/login"
              className="hidden md:flex items-center justify-center bg-white border border-black/10 text-ink px-6 py-2 rounded-full text-sm font-semibold hover:bg-surface transition-colors"
            >
              Login
            </Link>
          </>
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
            className="absolute top-20 left-0 right-0 bg-white border-b border-black/5 p-6 flex flex-col gap-4 md:hidden"
          >
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
                  onClick={() => { supabase.auth.signOut(); setIsOpen(false); }}
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
