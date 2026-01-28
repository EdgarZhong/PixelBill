import React from 'react';
import { DotMatrixText } from '../DotMatrixText';
import { triggerHaptic, HapticFeedbackLevel } from '../../utils/haptics';

interface HeaderProps {
  onLoadData: () => void;
  isLoading: boolean;
  onInitLedger?: () => void;
  onImportData?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLoadData, isLoading, onInitLedger, onImportData }) => {
  const handleLoadClick = async () => {
    await triggerHaptic(HapticFeedbackLevel.MEDIUM);
    onLoadData();
  };

  const handleInitLedger = async () => {
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    onInitLedger?.();
  };

  const handleImportData = async () => {
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    onImportData?.();
  };

  return (
    <header className="flex flex-col gap-6 py-6 border-b border-gray-800 mb-3 select-none">
      <div className="flex justify-between items-center w-full">
        <div className="flex items-center gap-4 group cursor-default">
          {/* Logo Icon */}
          <div className="relative">
            <div className="w-8 h-8 bg-pixel-green animate-box-glow" />
          </div>

          {/* Custom Dot Matrix "PIXEL BILL" */}
          <div className="flex gap-3 items-center leading-none h-[32px]">
            <h1 className="text-3xl font-pixel tracking-tighter text-gray-100 pt-[4px]">
              PIXEL
            </h1>
            <div className="text-pixel-green animate-text-glow cursor-default">
              <DotMatrixText text="BILL" size="md" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Subtitle Decoration */}
      <div className="text-[10px] text-dim tracking-[0.2em] font-mono opacity-60">
        GENERATIVE FINANCIAL TRACKER
      </div>

      {onInitLedger && onImportData ? (
        <div className="flex gap-3 w-full">
          {/* Ledger Button */}
          <button 
            onClick={handleInitLedger}
            disabled={isLoading}
            className="
              flex-1
              relative overflow-hidden group
              flex justify-center items-center gap-2 px-3 py-3
              font-pixel text-[10px] tracking-tight
              border border-gray-800
              bg-card 
              transition-all duration-300
              disabled:opacity-50 disabled:cursor-default
              enabled:hover:border-gray-600 enabled:hover:bg-white/5 enabled:hover:text-pixel-green
            "
          >
            <span className="relative z-10">[CHOOSE_LEDGER]</span>
          </button>

          {/* Import Button */}
          <button 
            onClick={handleImportData}
            disabled={isLoading}
            className="
              flex-1
              relative overflow-hidden group
              flex justify-center items-center gap-2 px-3 py-3
              font-pixel text-[10px] tracking-tight
              border border-gray-800
              bg-card 
              transition-all duration-300
              disabled:opacity-50 disabled:cursor-default
              enabled:hover:border-gray-600 enabled:hover:bg-white/5 enabled:hover:text-pixel-green
            "
          >
             <div className={`w-1.5 h-1.5 ${isLoading ? 'bg-income-yellow animate-spin' : 'bg-pixel-green group-hover:shadow-[0_0_8px_rgba(16,185,129,0.8)]'}`}></div>
            <span className="relative z-10">{isLoading ? 'LOADING...' : '[ADD_SOURCE]'}</span>
          </button>
        </div>
      ) : (
        <button 
          onClick={handleLoadClick}
          disabled={isLoading}
          className="
            w-full
            relative overflow-hidden group
            flex justify-center items-center gap-3 px-5 py-3
            font-pixel text-xs tracking-tight
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
      )}
    </header>
  );
};
