import React from 'react';
import { Link } from 'react-router-dom';

export const Footer = () => {
  return (
    <footer className="bg-white border-t border-black/5 pt-24 pb-12 px-6 md:px-12">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-24">
        <div className="col-span-1 md:col-span-1">
          <Link to="/" className="text-2xl font-black tracking-tighter mb-6 block">
            AETHERAI
          </Link>
          <p className="text-ink-muted text-sm leading-relaxed max-w-xs">
            The high-end editorial AI marketplace for curated digital workflows and cognitive tools.
          </p>
        </div>
        
        <div>
          <h4 className="font-bold mb-6 text-sm uppercase tracking-widest">Platform</h4>
          <ul className="flex flex-col gap-4 text-sm text-ink-muted">
            <li><Link to="/explore" className="hover:text-ink">Explore Workflows</Link></li>
            <li><Link to="/sell" className="hover:text-ink">Sell Workflows</Link></li>
            <li><Link to="/pricing" className="hover:text-ink">Pricing</Link></li>
          </ul>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row justify-between items-center pt-12 border-t border-black/5 gap-6">
        <p className="text-xs text-ink-muted">
          © 2026 AETHERAI. All rights reserved.
        </p>
        <div className="flex gap-8 text-xs text-ink-muted">
          <Link to="#" className="hover:text-ink">Privacy Policy</Link>
          <Link to="#" className="hover:text-ink">Terms of Service</Link>
          <Link to="#" className="hover:text-ink">Cookie Policy</Link>
        </div>
      </div>
    </footer>
  );
};
