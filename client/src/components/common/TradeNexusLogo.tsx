import React from 'react';

interface TradeNexusLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  textColor?: 'dark' | 'light';
  className?: string;
}

export const TradeNexusLogo: React.FC<TradeNexusLogoProps> = ({ 
  size = 'md', 
  showText = true,
  textColor = 'dark',
  className = ''
}) => {
  const iconDimensions = size === 'sm' ? 'w-9 h-9' : size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Official Mona Sri Emblem with Blue & Gold Accents */}
      <div className={`${iconDimensions} rounded-xl overflow-hidden flex-shrink-0 bg-[#0F172A] shadow-md shadow-blue-900/20 border border-[#D4AF37]/50 flex items-center justify-center p-0.5`}>
        <img 
          src="/logo-icon.png" 
          alt="Mona Sri Enterprises" 
          className="w-full h-full object-cover rounded-lg"
        />
      </div>

      {/* Brand Typography matching Logo (Blue + Gold) */}
      {showText && (
        <div className="flex flex-col justify-center">
          <span className={`font-display font-black text-sm sm:text-base tracking-wider leading-tight flex items-center gap-1.5 ${
            textColor === 'light' ? 'text-white' : 'text-[#0F172A]'
          }`}>
            <span className="text-[#1E40AF]">MONA</span>
            <span className="text-[#D4AF37]">SRI</span>
          </span>
          <span className="font-mono font-extrabold text-[8px] sm:text-[9px] tracking-[0.2em] uppercase leading-tight mt-0.5 text-[#B8860B]">
            ENTERPRISES · MAN POWER
          </span>
        </div>
      )}
    </div>
  );
};
