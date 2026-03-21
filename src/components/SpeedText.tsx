import React from 'react';
import { Droplet, Feather, Shovel } from '../icons';

interface SpeedTextProps {
  text: string;
}

export const SpeedText: React.FC<SpeedTextProps> = ({ text }) => {
  if (!text) return null;
  const cleanText = text.replace(/ft\.,/gi, 'ft.');
  const parts = cleanText.split(/(swim|fly|burrow)/i);
  return (
    <span className="inline-flex items-center flex-wrap whitespace-pre-wrap">
      {parts.map((part, i) => {
        const lower = part.toLowerCase();
        if (lower === 'swim') {
          return <Droplet key={i} size={11} className="text-blue-400 inline mx-0.5 -mt-0.5" />;
        }
        if (lower === 'fly') {
          return <Feather key={i} size={11} className="text-teal-300 inline mx-0.5 -mt-0.5" />;
        }
        if (lower === 'burrow') {
          return <Shovel key={i} size={11} className="text-amber-600 inline mx-0.5 -mt-0.5" />;
        }
        if (part) {
          return <span key={i}>{part}</span>;
        }
        return null;
      })}
    </span>
  );
};
