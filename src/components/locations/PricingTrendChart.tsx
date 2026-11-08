'use client';

import React, { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

export function PricingTrendChart({ history }: { history: any[] }) {
  const [basis, setBasis] = useState('CARPET_AREA');

  if (!history || history.length < 2) {
    return <p className="text-sm text-[#111111]/60">Insufficient historical data to show pricing trends.</p>;
  }

  const data = history.map(snap => {
    const metric = snap.priceMetrics?.find((m: any) => m.priceBasis === basis);
    return {
      date: snap.snapshotDate.split('-').slice(1).join('/'),
      rate: metric ? metric.medianRatePerSqft : null,
    };
  }).filter(d => d.rate !== null).reverse();

  if (data.length < 2) {
    return <p className="text-sm text-[#111111]/60">Insufficient historical data for selected pricing basis.</p>;
  }

  return (
    <div className="space-y-4" role="region" aria-label="Pricing trend section">
      <div className="flex gap-2" role="group" aria-label="Select pricing basis">
        {['CARPET_AREA', 'BUILT_UP_AREA', 'SUPER_BUILT_UP_AREA'].map(b => (
          <button 
            key={b} 
            onClick={() => setBasis(b)}
            className={`px-3 py-1 rounded-full text-xs ${basis === b ? 'bg-[#111111] text-white' : 'bg-[#FAFAF8] text-[#111111]/60'}`}
          >
            {b.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <div className="h-64 w-full" role="img" aria-label={`Pricing trend chart showing ${data.length} recorded rates for ${basis.replace(/_/g, ' ')}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(17,17,17,0.08)" />
            <XAxis dataKey="date" stroke="#111111" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#111111" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid rgba(17,17,17,0.08)' }} />
            <Line type="monotone" dataKey="rate" name="Rate/sq.ft." stroke="#E85D3F" strokeWidth={2} dot={{r: 4}} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
