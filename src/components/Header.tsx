import React from 'react';
import { DotMatrixText } from './DotMatrixText';

interface HeaderProps {
  onLoadData: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onLoadData, isLoading }) => {
  return (
    <header className="flex justify-between items-start py-8 border-b border-gray-800 mb-8 select-none">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-6 group cursor-default">
          {/* Logo Icon */}
          <div className="relative">
            <div className="w-8 h-8 bg-pixel-green animate-box-glow" />
          </div>

          {/* Custom Dot Matrix "PIXEL BILL" */}
          <div className="flex gap-5 items-center leading-none h-[44px]">
            <h1 className="text-4xl font-pixel tracking-tighter text-gray-100 pt-[4px]">
              PIXEL
            </h1>
            <div className="text-pixel-green animate-text-glow cursor-default -translate-y-[2px]">
              <DotMatrixText text="BILL" size="lg" />
            </div>
          </div>
        </div>

        {/* Subtitle Decoration - Aligned with text (Logo width 32px + gap 24px = 56px) */}
        <div className="pl-[56px] text-xs text-dim tracking-[0.2em] font-mono opacity-60">
          GENERATIVE FINANCIAL TRACKER
        </div>
      </div>
      
      <button 
        onClick={onLoadData}
        disabled={isLoading}
        className="
          relative overflow-hidden group
          flex items-center gap-3 px-5 py-2.5 
          font-pixel text-[10px] tracking-tight
          border border-gray-800
          bg-card 
          transition-all duration-300
          disabled:opacity-50 disabled:cursor-default
          enabled:hover:border-gray-600 enabled:hover:bg-white/5 enabled:hover:text-pixel-green
        "
      >
        <div className={`w-1.5 h-1.5 ${isLoading ? 'bg-income-yellow animate-spin' : 'bg-pixel-green group-hover:shadow-[0_0_8px_rgba(16,185,129,0.8)]'}`}></div>
        <span className="relative z-10">{isLoading ? 'PROCESSING_STREAM...' : '[LOAD_DATA_SOURCE]'}</span>
      </button>
    </header>
  );
};
