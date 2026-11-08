'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

export function ConfigurationMixChart({ history }: { history: any[] }) {
  if (!history || history.length === 0) {
    return <p className="text-sm text-[#111111]/60">Insufficient historical data to show configuration mix.</p>;
  }

  const latest = history[0];
  const data = [
    { name: '1 BHK', count: latest.configurationCounts?.bhk1Count || 0 },
    { name: '2 BHK', count: latest.configurationCounts?.bhk2Count || 0 },
    { name: '3 BHK', count: latest.configurationCounts?.bhk3Count || 0 },
    { name: '4 BHK', count: latest.configurationCounts?.bhk4Count || 0 },
    { name: '5+ BHK', count: latest.configurationCounts?.bhk5PlusCount || 0 },
  ].filter(d => d.count > 0);

  if (data.length === 0) {
    return <p className="text-sm text-[#111111]/60">No configuration data available.</p>;
  }

  return (
    <div className="h-64 w-full" role="img" aria-label="Configuration mix bar chart showing distribution of bedroom counts.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="name" stroke="#111111" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#111111" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid rgba(17,17,17,0.08)' }} />
          <Bar dataKey="count" fill="#111111" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
