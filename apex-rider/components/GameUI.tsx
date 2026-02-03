import React from 'react';
import { GameState } from '../types';

interface GameUIProps {
  gameState: GameState;
  score: number;
  highScore: number;
  onStart: () => void;
  onRestart: () => void;
}

const GameUI: React.FC<GameUIProps> = ({ gameState, score, highScore, onStart, onRestart }) => {
  if (gameState === GameState.PLAYING) {
    return (
      <div className="absolute top-8 left-0 w-full flex justify-center pointer-events-none z-10">
        <div className="text-transparent bg-clip-text bg-gradient-to-b from-white to-cyan-400 font-black text-4xl drop-shadow-[0_0_10px_rgba(0,243,255,0.8)] italic">
          {score.toString().padStart(6, '0')}
        </div>
      </div>
    );
  }

  if (gameState === GameState.GAME_OVER) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-20 animate-fade-in">
        <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-pink-600 mb-2 italic tracking-tighter drop-shadow-[0_0_15px_rgba(255,0,85,0.8)]">CRASHED</h1>
        <div className="text-white text-2xl mb-8 font-mono">Score: <span className="text-cyan-400">{score}</span></div>
        <button
          onClick={onRestart}
          className="bg-yellow-400 hover:bg-yellow-300 text-black font-black py-4 px-12 rounded-sm text-xl shadow-[0_0_30px_rgba(250,204,21,0.6)] skew-x-[-10deg] transition-transform active:scale-95 border-2 border-white"
        >
          RETRY
        </button>
      </div>
    );
  }

  // MENU
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#050510] z-20 overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,243,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,243,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20"></div>
      
      <h1 className="relative text-7xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 italic tracking-tighter mb-4 drop-shadow-[0_0_25px_rgba(0,243,255,0.5)] z-10">
        APEX <span className="text-cyan-400 drop-shadow-[0_0_15px_rgba(0,243,255,0.8)]">RIDER</span>
      </h1>
      
      <p className="text-cyan-200/80 mb-10 text-center font-mono text-sm tracking-widest z-10">
        // NEON HIGHWAY SIMULATION //
      </p>
      
      <div className="mb-12 flex flex-col items-center z-10 p-4 border border-cyan-500/30 bg-black/40 backdrop-blur rounded-lg">
        <span className="text-[10px] text-cyan-400 uppercase tracking-[0.2em] mb-1">High Score</span>
        <span className="text-3xl text-white font-mono drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">{highScore.toString().padStart(6, '0')}</span>
      </div>

      <button
        onClick={onStart}
        className="relative group bg-cyan-500 hover:bg-cyan-400 text-black font-black py-5 px-16 rounded-sm text-2xl shadow-[0_0_40px_rgba(0,243,255,0.4)] transition-all active:scale-95 skew-x-[-10deg] z-10 overflow-hidden"
      >
        <span className="relative z-10">IGNITION</span>
        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
      </button>
    </div>
  );
};

export default GameUI;