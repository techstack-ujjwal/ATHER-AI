/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { supabase } from './lib/supabaseClient';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { Home } from './pages/Home';
import { Explore } from './pages/Explore';
import { Sell } from './pages/Sell';
import { Pricing } from './pages/Pricing';
import { Login } from './pages/Login';
import { Admin } from './pages/Admin';
import { Profile } from './pages/Profile';
import { Cart } from './pages/Cart';
import { WorkflowDetail } from './pages/WorkflowDetail';
import { motion, AnimatePresence } from 'motion/react';

const PageWrapper = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

export default function App() {
  React.useEffect(() => {
    // Listen for auth state changes (especially after Google OAuth redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[App] Auth event:", event);
      if (event === 'SIGNED_IN' && session) {
        // Manually sync session to the key expected by Navbar
        const localKey = 'sb-fvywzznegjfmlaqodfoj-auth-token';
        localStorage.setItem(localKey, JSON.stringify(session));
        // Force Navbar and other components to re-read localStorage
        window.dispatchEvent(new Event('auth-updated'));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <ThemeProvider>
      <ToastProvider>
        <Router>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-grow">
              <Routes>
                <Route path="/" element={<PageWrapper><Home /></PageWrapper>} />
                <Route path="/explore" element={<PageWrapper><Explore /></PageWrapper>} />
                <Route path="/sell" element={<PageWrapper><Sell /></PageWrapper>} />
                <Route path="/pricing" element={<PageWrapper><Pricing /></PageWrapper>} />
                <Route path="/login" element={<PageWrapper><Login /></PageWrapper>} />
                <Route path="/admin" element={<PageWrapper><Admin /></PageWrapper>} />
                <Route path="/profile" element={<PageWrapper><Profile /></PageWrapper>} />
                <Route path="/cart" element={<PageWrapper><Cart /></PageWrapper>} />
                <Route path="/workflow/:id" element={<PageWrapper><WorkflowDetail /></PageWrapper>} />
              </Routes>
            </main>
            <Footer />
          </div>
        </Router>
      </ToastProvider>
    </ThemeProvider>
  );
}
