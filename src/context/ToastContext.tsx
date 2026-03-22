import React, { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="pointer-events-auto"
            >
              <div className={`
                min-w-[300px] max-w-md bg-white rounded-2xl p-4 shadow-2xl border border-black/5
                flex items-center gap-4 relative overflow-hidden group
              `}>
                <div className={`
                  w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                  ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 
                    toast.type === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}
                `}>
                  {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
                  {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
                  {toast.type === 'info' && <Info className="w-5 h-5" />}
                </div>
                
                <div className="flex-grow pr-6">
                  <p className="text-sm font-bold text-ink leading-tight">{toast.message}</p>
                </div>

                <button 
                  onClick={() => removeToast(toast.id)}
                  className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Progress bar */}
                <motion.div 
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: 4, ease: "linear" }}
                  className={`absolute bottom-0 left-0 right-0 h-1 origin-left ${
                    toast.type === 'success' ? 'bg-emerald-500' : 
                    toast.type === 'error' ? 'bg-rose-500' : 'bg-blue-500'
                  }`}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
