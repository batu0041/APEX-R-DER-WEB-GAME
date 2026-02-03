import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import GameUI from './components/GameUI';
import { GameState } from './types';

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem('apex_high_score');
    if (stored) setHighScore(parseInt(stored));
  }, []);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('apex_high_score', score.toString());
    }
  }, [score, highScore]);

  const handleStart = () => {
    setScore(0);
    setGameState(GameState.PLAYING);
  };

  const handleRestart = () => {
    setScore(0);
    setGameState(GameState.PLAYING);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900 select-none">
      <GameCanvas 
        gameState={gameState} 
        setGameState={setGameState}
        setScore={setScore}
      />
      <GameUI 
        gameState={gameState} 
        score={score} 
        highScore={highScore}
        onStart={handleStart} 
        onRestart={handleRestart}
      />
      
      {/* Mobile Input Hint */}
      {gameState === GameState.MENU && (
         <div className="absolute bottom-10 w-full text-center text-cyan-500/50 animate-pulse text-sm font-mono pointer-events-none">
             Hold Left/Right to Steer
         </div>
      )}
    </div>
  );
}

export default App;