import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, ShoppingBag, ArrowRight, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../context/ToastContext';
import { loadRazorpayScript } from '../lib/razorpayClient';

export const Cart = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

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

  const total = cartItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;
    
    setIsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast("Please login to proceed with checkout.", "error");
        navigate('/login');
        return;
      }

      const res = await loadRazorpayScript();
      if (!res) {
        showToast("Razorpay SDK failed to load.", "error");
        return;
      }

      // Create order
      const orderResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: total, currency: 'USD' })
      });
      const orderData = await orderResponse.json();

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'AETHER AI',
        description: `Purchase of ${cartItems.length} workflows`,
        order_id: orderData.id,
        handler: async function (response: any) {
          try {
            const verifyRes = await fetch(`${import.meta.env.VITE_API_URL}/api/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });
            const verifyData = await verifyRes.json();
            
            if (verifyData.success) {
              // Record purchases for each item
              const purchaseRecords = cartItems.map(item => ({
                userId: session.user.id,
                workflowId: item.id,
                amount: parseFloat(item.price)
              }));

              const { error: purchaseError } = await supabase.from('Purchase').insert(purchaseRecords);
              
              if (purchaseError) throw purchaseError;

              // Clear cart
              localStorage.removeItem('aether_cart');
              setCartItems([]);
              window.dispatchEvent(new Event('cart-updated'));
              
              showToast("Purchase successful! You can now access your workflows.", "success");
              navigate('/explore');
            } else {
              showToast("Payment verification failed.", "error");
            }
          } catch (err) {
            console.error(err);
            showToast("Error processing purchase.", "error");
          }
        },
        prefill: {
          name: session.user.email?.split('@')[0],
          email: session.user.email,
        },
        theme: { color: '#000000' }
      };

      const rzp = (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Checkout failed", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="pt-20 min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-6 md:px-12 py-16">

        <div className="flex items-center gap-4 mb-12 text-ink">
          <ShoppingBag className="w-8 h-8" />
          <h1 className="text-4xl font-black tracking-tighter uppercase">YOUR CART</h1>
          <span className="bg-ink text-white dark:bg-white dark:text-ink text-sm font-bold px-3 py-1 rounded-full">{cartItems.length}</span>
        </div>

        {cartItems.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white dark:bg-surface-container-low rounded-3xl p-20 text-center border border-black/5 dark:border-white/5">
            <ShoppingBag className="w-12 h-12 text-ink/20 mx-auto mb-4" />
            <p className="font-bold text-xl mb-2 text-ink">Your cart is empty</p>
            <p className="text-ink-muted text-sm mb-8">Browse the Explore page to find workflows.</p>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/explore')} className="bg-ink text-white dark:bg-white dark:text-ink px-8 py-4 rounded-full font-bold hover:shadow-xl transition-all duration-300 inline-flex items-center gap-2 text-sm uppercase tracking-widest">
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
                    className="bg-white dark:bg-surface-container-low rounded-2xl border border-black/5 dark:border-white/5 p-6 flex items-center gap-6"
                  >
                    {item.imageUrl || item.image ? (
                      <img src={item.imageUrl || item.image} alt={item.title} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-16 h-16 bg-surface rounded-xl flex items-center justify-center font-black text-2xl text-ink/20 shrink-0">
                        {item.title?.charAt(0)}
                      </div>
                    )}
                    <div className="flex-grow min-w-0">
                      <h3 className="font-bold text-lg truncate text-ink">{item.title}</h3>
                      <p className="text-ink-muted text-sm truncate">{item.description}</p>
                      <span className="text-[10px] font-bold uppercase bg-surface px-3 py-1 rounded-full mt-2 inline-block text-ink-muted border border-black/5">{item.category}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xl font-black text-ink">${item.price}</p>
                      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => removeItem(item.id)} className="mt-2 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Summary */}
            <div className="bg-ink dark:bg-surface-container-highest text-white dark:text-ink rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 dark:bg-black/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative z-10">
                <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mb-1">Total Amount</p>
                <p className="text-4xl font-black">${total.toFixed(2)}</p>
              </div>
              <motion.button 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }} 
                onClick={handleCheckout} 
                disabled={isProcessing}
                className="relative z-10 bg-white dark:bg-ink text-ink dark:text-white px-10 py-5 rounded-2xl font-black hover:shadow-2xl transition-all duration-300 flex items-center gap-3 w-full md:w-auto justify-center disabled:opacity-50"
              >
                {isProcessing ? "PROCESSING..." : (
                  <>PAY NOW <CreditCard className="w-5 h-5" /></>
                )}
              </motion.button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

