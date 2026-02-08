'use client';

import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: true,
  theme: 'dark',
  securityLevel: 'loose',
  themeVariables: {
    primaryColor: '#e11d48',
    primaryTextColor: '#fff',
    primaryBorderColor: '#e11d48',
    lineColor: '#ffffff',
    secondaryColor: '#334155',
    tertiaryColor: '#0f172a'
  }
});

interface MermaidProps {
  chart: string;
}

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      mermaid.contentLoaded();
    }
  }, [chart]);

  return (
    <div key={chart} className="mermaid flex justify-center bg-transparent" ref={ref}>
      {chart}
    </div>
  );
};

export default Mermaid;
