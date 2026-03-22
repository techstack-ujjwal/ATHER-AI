import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ArrowRight, HelpCircle, X } from 'lucide-react';
import { SuccessModal } from '../components/SuccessModal';
import { loadRazorpayScript } from '../lib/razorpayClient';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';

export const Pricing = () => {
  const { showToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customEmail, setCustomEmail] = useState("");
  const [customDetails, setCustomDetails] = useState("");
  const [customStatus, setCustomStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const navigate = useNavigate();

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

  const tiers = [
    {
      name: "Basis",
      price: "$0",
      description: "For individuals exploring the potential of AI automation.",
      features: [
        "Access to free workflows",
        "Community support",
        "Standard execution speed",
        "Basic API access"
      ],
      cta: "Get Started",
      highlight: false
    },
    {
      name: "Architect",
      price: "$29",
      description: "For professionals building serious cognitive systems.",
      features: [
        "Access to premium workflows",
        "Priority support",
        "Enhanced execution speed",
        "Advanced API access",
        "Custom manifest exports"
      ],
      cta: "Start Free Trial",
      highlight: true
    },
    {
      name: "Enterprise",
      price: "Custom",
      description: "For organizations requiring scale and absolute security.",
      features: [
        "Unlimited workflow access",
        "Dedicated account manager",
        "On-premise deployment",
        "SLA guarantees",
        "Custom security audits"
      ],
      cta: "Contact Sales",
      highlight: false
    }
  ];

  const handleSubscribe = async (tier: any) => {
    if (tier.price === 'Custom') {
       setShowCustomModal(true);
       return;
    }
    if (tier.price === '$0') {
       setSelectedTier(tier.name);
       setShowModal(true);
       return;
    }

    setIsProcessing(true);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        showToast("Backend API URL (VITE_API_URL) is not configured in environment variables.", "error");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast("Please login first to subscribe.", "error");
        navigate('/login');
        return;
      }

      const res = await loadRazorpayScript();
      if (!res) {
        showToast('Razorpay SDK failed to load. Are you offline?', "error");
        return;
      }

      const amount = parseInt(tier.price.replace('$', ''));
      const orderResponse = await fetch(`${apiUrl}/api/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, currency: 'USD' })
      });
      
      if (!orderResponse.ok) {
        throw new Error(`Failed to create order: ${orderResponse.statusText}`);
      }
      
      const orderData = await orderResponse.json();

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_placeholder',
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'AETHER AI',
        description: `${tier.name} Subscription`,
        order_id: orderData.id,
        handler: async function (response: any) {
          try {
            const verifyRes = await fetch(`${apiUrl}/api/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                userId: session.user.id,
                orgId: session.user.id
              })
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
               // Update both auth metadata AND the User table
               await Promise.all([
                 supabase.auth.updateUser({
                   data: { plan: tier.name }
                 }),
                 supabase.from('User').update({ plan: tier.name }).eq('id', session.user.id)
               ]);
               
               setSelectedTier(tier.name);
               setShowModal(true);
               showToast(`Successfully upgraded to ${tier.name} plan!`, "success");
            } else {
               showToast("Payment verification failed.", "error");
            }
          } catch (err) {
            console.error(err);
            showToast("Error during verification", "error");
          }
        },
        prefill: {
          name: session.user.email?.split('@')[0],
          email: session.user.email,
        },
        theme: {
          color: '#000000'
        }
      };

      const paymentObject = new (window as any).Razorpay(options);
      paymentObject.open();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Could not initiate payment. Please try again.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="pt-20 min-h-screen bg-white">
      <section className="px-6 md:px-12 py-24 md:py-32 text-center">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-8xl font-black tracking-tighter leading-none mb-8"
        >
          SELECT YOUR <br />
          <span className="text-ink-muted">COGNITIVE TIER.</span>
        </motion.h1>
        <p className="text-lg text-ink-muted max-w-xl mx-auto mb-16">
          Flexible plans designed to grow with your automation needs. 
          No hidden fees, cancel anytime.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {tiers.map((tier, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`p-12 rounded-[3rem] text-left flex flex-col h-full transition-all duration-500
                ${tier.highlight ? "bg-ink text-white scale-105 shadow-2xl shadow-black/20" : "bg-surface border border-black/5 hover:border-black/20"}
              `}
            >
              <h3 className="text-xl font-bold mb-2 uppercase tracking-widest">{tier.name}</h3>
              <div className="flex items-end gap-2 mb-6">
                <span className="text-5xl font-black">{tier.price}</span>
                {tier.price !== "Custom" && <span className={tier.highlight ? "text-white/60 mb-2" : "text-ink-muted mb-2"}>/month</span>}
              </div>
              <p className={`text-sm mb-12 leading-relaxed ${tier.highlight ? "text-white/70" : "text-ink-muted"}`}>
                {tier.description}
              </p>
              
              <ul className="space-y-4 mb-12 flex-grow">
                {tier.features.map((feature, j) => (
                  <li key={j} className="flex items-center gap-3 text-sm font-medium">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0
                      ${tier.highlight ? "bg-white text-ink" : "bg-ink text-white"}
                    `}>
                      <Check className="w-3 h-3" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>

              <motion.button 
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => handleSubscribe(tier)}
                disabled={isProcessing}
                className={`w-full py-4 rounded-full font-bold transition-all hover:shadow-xl
                ${tier.highlight ? "bg-white text-ink hover:bg-surface" : "bg-ink text-white hover:opacity-90"}
                disabled:opacity-50
              `}>
                {isProcessing ? 'Processing...' : tier.cta}
              </motion.button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="px-6 md:px-12 py-24 bg-surface">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-4 mb-12">
            <HelpCircle className="w-8 h-8" />
            <h2 className="text-3xl font-black tracking-tighter">STUDENT RESOURCES</h2>
          </div>
          
          <div className="space-y-8">
            {[
              { q: "Do you offer student discounts?", a: "Yes! Students with a valid .edu email address are eligible for a 50% discount on the Architect plan for up to 2 years." },
              { q: "Can I switch plans mid-month?", a: "Absolutely. Your billing will be adjusted pro-rata based on the remaining days in your cycle." },
              { q: "What happens if I cancel my subscription?", a: "You'll retain access to your purchased workflows and premium features until the end of your current billing period." }
            ].map((faq, i) => (
              <div key={i} className="bg-white p-8 rounded-3xl border border-black/5">
                <h4 className="font-bold mb-4 text-lg">{faq.q}</h4>
                <p className="text-ink-muted text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 md:px-12 py-32 text-center">
        <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-8">READY TO EVOLVE?</h2>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="inline-block mx-auto">
          <button 
             onClick={() => navigate('/sell')}
             className="bg-ink text-white px-12 py-5 rounded-full font-bold flex items-center gap-2 hover:shadow-2xl transition-all duration-300">
            Start Selling Workflows <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </section>

      <SuccessModal 
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Subscription Active"
        message={`You have successfully subscribed to the ${selectedTier} tier. Welcome to the cognitive future.`}
      />

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
              
              <h3 className="text-3xl font-black tracking-tighter mb-2">ENTERPRISE INQUIRY</h3>
              <p className="text-ink-muted text-sm mb-8">Discuss dedicated infrastructure and on-premise solutions with our team.</p>
              
              {customStatus === "success" ? (
                <div className="bg-green-50 text-green-700 p-6 rounded-2xl font-bold flex flex-col items-center justify-center text-center gap-2">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mb-2">✓</div>
                  Inquiry Received!
                  <span className="text-sm font-normal text-green-600 block mt-1">Our enterprise accounts team will contact you shortly.</span>
                </div>
              ) : (
                <form onSubmit={handleCustomSubmit} className="space-y-6">
                  {customStatus === "error" && (
                     <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl font-medium">Failed to submit. Are you online?</div>
                  )}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-ink-muted">Work Email Address</label>
                    <input 
                      type="email" 
                      required
                      value={customEmail}
                      onChange={e => setCustomEmail(e.target.value)}
                      placeholder="executive@enterprise.com" 
                      className="w-full bg-surface border border-black/10 rounded-xl py-4 px-4 outline-none focus:border-ink transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-ink-muted">Deployment Needs</label>
                    <textarea 
                      required
                      value={customDetails}
                      onChange={e => setCustomDetails(e.target.value)}
                      placeholder="Tell us about your scale and security requirements..." 
                      className="w-full bg-surface border border-black/10 rounded-xl py-4 px-4 outline-none focus:border-ink transition-colors min-h-[120px] resize-none"
                    />
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    disabled={customStatus === "submitting"}
                    className="w-full bg-ink text-white py-4 rounded-xl font-bold hover:shadow-xl transition-all duration-300 disabled:opacity-50"
                  >
                    {customStatus === "submitting" ? "Sending..." : "Submit Inquiry"}
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
