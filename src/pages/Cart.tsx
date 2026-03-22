import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Cart = () => {
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState<any[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('aether_cart');
    setCartItems(stored ? JSON.parse(stored) : []);
  }, []);

  const removeItem = (id: string) => {
    const updated = cartItems.filter(item => item.id !== id);
    setCartItems(updated);
    localStorage.setItem('aether_cart', JSON.stringify(updated));
    window.dispatchEvent(new Event('cart-updated'));
  };

  const total = cartItems.reduce((sum, item) => sum + (item.price || 0), 0);

  return (
    <div className="pt-20 min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-16">

        <div className="flex items-center gap-4 mb-12">
          <ShoppingBag className="w-8 h-8" />
          <h1 className="text-4xl font-black tracking-tighter">YOUR CART</h1>
          <span className="bg-ink text-white text-sm font-bold px-3 py-1 rounded-full">{cartItems.length}</span>
        </div>

        {cartItems.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-3xl p-20 text-center border border-black/5">
            <ShoppingBag className="w-12 h-12 text-ink/20 mx-auto mb-4" />
            <p className="font-bold text-xl mb-2">Your cart is empty</p>
            <p className="text-ink-muted text-sm mb-8">Browse the Explore page to find workflows.</p>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/explore')} className="bg-ink text-white px-8 py-4 rounded-full font-bold hover:shadow-xl transition-all duration-300 inline-flex items-center gap-2">
              Explore Workflows <ArrowRight className="w-4 h-4" />
            </motion.button>
          </motion.div>
        ) : (
          <>
            <div className="space-y-4 mb-10">
              <AnimatePresence>
                {cartItems.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white rounded-2xl border border-black/5 p-6 flex items-center gap-6"
                  >
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-16 h-16 bg-surface rounded-xl flex items-center justify-center font-black text-2xl text-ink/20 shrink-0">
                        {item.title?.charAt(0)}
                      </div>
                    )}
                    <div className="flex-grow min-w-0">
                      <h3 className="font-bold text-lg truncate">{item.title}</h3>
                      <p className="text-ink-muted text-sm truncate">{item.description}</p>
                      <span className="text-xs font-bold bg-surface px-3 py-1 rounded-full mt-2 inline-block">{item.category}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xl font-black">${item.price}</p>
                      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => removeItem(item.id)} className="mt-2 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Summary */}
            <div className="bg-ink text-white rounded-3xl p-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold opacity-60 uppercase tracking-widest mb-1">Total</p>
                <p className="text-4xl font-black">${total.toFixed(2)}</p>
              </div>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/pricing')} className="bg-white text-ink px-8 py-4 rounded-full font-bold hover:shadow-2xl transition-all duration-300 flex items-center gap-2">
                Proceed to Checkout <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
