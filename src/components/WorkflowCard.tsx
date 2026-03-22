import React from 'react';
import { ArrowUpRight, Star, Zap, Lock } from 'lucide-react';
import { motion } from 'motion/react';

interface WorkflowCardProps {
  title: string;
  category: string;
  price: string;
  rating: number;
  sales: string;
  image: string;
  complexity: 'Low' | 'Medium' | 'High';
  key?: React.Key;
  isLocked?: boolean;
}

export const WorkflowCard = ({ title, category, price, rating, sales, image, complexity, isLocked }: WorkflowCardProps) => {
  return (
    <motion.div 
      whileHover={{ y: -8 }}
      className="group bg-surface rounded-3xl overflow-hidden flex flex-col h-full"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img 
          src={image} 
          alt={title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-4 left-4 flex gap-2">
          <span className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
            {category}
          </span>
          <span className={
            `px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm
            ${complexity === 'Low' ? 'bg-emerald-100/90 text-emerald-700' : 
              complexity === 'Medium' ? 'bg-amber-100/90 text-amber-700' : 
              'bg-rose-100/90 text-rose-700'}`
          }>
            {complexity}
          </span>
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
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold leading-tight group-hover:text-ink transition-colors">
            {title}
          </h3>
          <button className="p-2 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex items-center gap-4 mt-auto">
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-ink" />
            <span className="text-xs font-bold">{rating}</span>
          </div>
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-ink-muted" />
            <span className="text-xs text-ink-muted font-medium">{sales} sales</span>
          </div>
          <div className="ml-auto">
            <span className="text-lg font-black">{price}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
