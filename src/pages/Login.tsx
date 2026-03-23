import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Mail, Lock, Shield } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        if (signInError.message.includes('Invalid login')) {
           const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
           });
           if (signUpError) throw signUpError;
           alert("Registration successful! Please check your email for a confirmation link.");
        } else {
            throw signInError;
        }
      } else if (data.session) {
        // Manually persist to the key our Navbar reads from localStorage
        const localKey = 'sb-fvywzznegjfmlaqodfoj-auth-token';
        localStorage.setItem(localKey, JSON.stringify(data.session));
        // Fire auth-updated so Navbar instantly re-reads the session
        window.dispatchEvent(new Event('auth-updated'));
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google.");
    }
  };

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center bg-surface relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-ink/5 rounded-full blur-3xl pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-white p-10 md:p-12 rounded-[2rem] shadow-2xl shadow-black/5 relative z-10 border border-black/5 mx-6"
      >
        <div className="text-center mb-10">
          <Link to="/" className="text-2xl font-black tracking-tighter block mb-6 inline-block">
            AETHERAI
          </Link>
          <h1 className="text-3xl font-black tracking-tighter mb-2">WELCOME BACK</h1>
          <p className="text-ink-muted text-sm">Access your cognitive workspace.</p>
        </div>

        <form className="space-y-6" onSubmit={handleAuth}>
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-ink-muted">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-muted" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="architect@aether.ai"
                className="w-full bg-surface border border-black/10 rounded-xl py-4 pl-12 pr-4 outline-none focus:border-ink transition-colors"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase tracking-widest text-ink-muted">Password</label>
              <Link to="#" className="text-xs font-bold text-ink-muted hover:text-ink">Forgot?</Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-muted" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface border border-black/10 rounded-xl py-4 pl-12 pr-4 outline-none focus:border-ink transition-colors"
                required
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-ink text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Authenticate"} <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 flex items-center gap-4">
          <div className="h-px bg-black/10 flex-grow" />
          <span className="text-xs font-bold text-ink-muted uppercase tracking-widest">Or</span>
          <div className="h-px bg-black/10 flex-grow" />
        </div>

        <button
          onClick={handleGoogleLogin}
          type="button"
          className="w-full mt-6 bg-white border border-black/10 text-ink py-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-surface transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-muted bg-surface-container-low py-3 rounded-full">
          <Shield className="w-4 h-4" />
          <span>Enterprise-grade encryption active</span>
        </div>
      </motion.div>
    </div>
  );
};
