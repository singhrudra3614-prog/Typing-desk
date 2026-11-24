'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface GlowButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  variant?: 'cyan' | 'pink' | 'purple' | 'green';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

export function GlowButton({ 
  variant = 'cyan', 
  size = 'md', 
  className, 
  children, 
  ...props 
}: GlowButtonProps) {
  const variants = {
    cyan: 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/50 hover:bg-neon-cyan/20 shadow-[0_0_15px_rgba(6,182,212,0.3)]',
    pink: 'bg-neon-pink/10 text-neon-pink border-neon-pink/50 hover:bg-neon-pink/20 shadow-[0_0_15px_rgba(236,72,153,0.3)]',
    purple: 'bg-neon-purple/10 text-neon-purple border-neon-purple/50 hover:bg-neon-purple/20 shadow-[0_0_15px_rgba(168,85,247,0.3)]',
    green: 'bg-neon-green/10 text-neon-green border-neon-green/50 hover:bg-neon-green/20 shadow-[0_0_15px_rgba(34,197,94,0.3)]',
  };

  const sizes = {
    sm: 'px-4 py-1.5 text-sm',
    md: 'px-6 py-2.5 text-base',
    lg: 'px-8 py-4 text-lg font-bold uppercase tracking-widest',
    xl: 'px-12 py-6 text-2xl font-black uppercase tracking-[0.2em]',
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        'relative overflow-hidden rounded-lg border transition-all duration-300 font-display',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      <div className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </div>
      <div className={cn(
        "absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100",
        "bg-gradient-to-r from-transparent via-white/5 to-transparent"
      )} />
    </motion.button>
  );
}

export function StatsCard({ 
  label, 
  value, 
  icon: Icon, 
  trend,
  trendLabel = "vs last session",
  color = 'cyan'
}: { 
  label: string; 
  value: string | number; 
  icon: any; 
  trend?: string;
  trendLabel?: string;
  color?: 'cyan' | 'pink' | 'purple' | 'green';
}) {
  const colors = {
    cyan: 'text-neon-cyan shadow-neon-cyan/20',
    pink: 'text-neon-pink shadow-neon-pink/20',
    purple: 'text-neon-purple shadow-neon-purple/20',
    green: 'text-neon-green shadow-neon-green/20',
  };

  return (
    <div className="bg-glass rounded-2xl p-6 relative overflow-hidden group">
      <div className={cn("absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity", colors[color])}>
        <Icon size={64} strokeWidth={1} />
      </div>
      <div className="relative z-10">
        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">{label}</p>
        <h3 className={cn("text-3xl font-display font-bold mt-1", colors[color])}>{value}</h3>
        {trend && (
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <span className="text-neon-green">{trend}</span> {trendLabel}
          </p>
        )}
      </div>
    </div>
  );
}
