import React, { useState } from 'react';
import { ShoppingCart, Star, Zap, Lock, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

interface WorkflowCardProps {
  id?: string;
  title: string;
  category: string;
  price: string | number;
  rating?: number;
  sales?: string;
  image?: string;
  imageUrl?: string;
  complexity?: 'Low' | 'Medium' | 'High';
  key?: React.Key;
  isLocked?: boolean;
  description?: string;
}

export const WorkflowCard = ({ id, title, category, price, rating, sales, image, imageUrl, complexity, isLocked, description }: WorkflowCardProps) => {
  const [added, setAdded] = useState(false);
  const navigate = useNavigate();

  const addToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLocked) return;
    const stored = localStorage.getItem('aether_cart');
    const cart = stored ? JSON.parse(stored) : [];
    if (!cart.find((item: any) => item.id === id)) {
      cart.push({ id, title, category, price, image: imageUrl || image, description });
      localStorage.setItem('aether_cart', JSON.stringify(cart));
      window.dispatchEvent(new Event('cart-updated'));
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleCardClick = () => {
    if (id && !isLocked) {
      navigate(`/workflow/${id}`);
    } else if (isLocked) {
      navigate('/pricing');
    }
  };

  const displayImage = imageUrl || image;
  const rawPrice = price ?? 0;
  const numericPrice = typeof rawPrice === 'number' ? rawPrice : (parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0);
  const isFree = numericPrice === 0;
  const displayPrice = isFree ? 'Free' : `$${numericPrice}`;

  return (
    <motion.div 
      whileHover={{ y: -8 }}
      onClick={handleCardClick}
      className="group bg-surface rounded-3xl overflow-hidden flex flex-col h-full cursor-pointer"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-container-highest">
        {displayImage ? (
          <img 
            src={displayImage} 
            alt={title} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-5xl font-black text-ink/10">{title?.charAt(0)}</span>
          </div>
        )}
        <div className="absolute top-4 left-4 flex gap-2 flex-wrap">
          <span className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
            {category}
          </span>
          {complexity && (
            <span className={
              `px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm
              ${complexity === 'Low' ? 'bg-emerald-100/90 text-emerald-700' : 
                complexity === 'Medium' ? 'bg-amber-100/90 text-amber-700' : 
                'bg-rose-100/90 text-rose-700'}`
            }>
              {complexity}
            </span>
          )}
          {isFree && (
            <span className="bg-emerald-500/90 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
              FREE
            </span>
          )}
        </div>
        {isLocked && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center transition-opacity">
            <div className="bg-white px-4 py-2 rounded-full flex items-center gap-2 font-bold text-sm shadow-xl">
              <Lock className="w-4 h-4" /> Premium
            </div>
          </div>
        )}
      </div>
      
      <div className="p-6 flex flex-col flex-grow">
        <h3 className="text-lg font-bold leading-tight group-hover:text-ink transition-colors mb-2">
          {title}
        </h3>
        {description && (
          <p className="text-ink-muted text-sm line-clamp-2 mb-4">{description}</p>
        )}
        
        <div className="flex items-center gap-3 mt-auto">
          {rating !== undefined && (
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-ink" />
              <span className="text-xs font-bold">{rating}</span>
            </div>
          )}
          {sales && (
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-ink-muted" />
              <span className="text-xs text-ink-muted font-medium">{sales} sales</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className={`text-lg font-black ${isFree ? 'text-emerald-600' : ''}`}>{displayPrice}</span>
            {!isLocked && !isFree && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={addToCart}
                className={`p-2 rounded-full transition-all duration-300 ${added ? 'bg-green-500 text-white' : 'bg-white shadow-sm hover:shadow-md text-ink'}`}
              >
                {added ? <Check className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
