'use client';

import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

export function ReraCoverageChart({ history }: { history: any[] }) {
  if (!history || history.length === 0) {
    return <p className="text-sm text-[#111111]/60">Insufficient historical data to show RERA coverage.</p>;
  }

  const latest = history[0];
  const data = [
    { name: 'Verified', value: latest.reraMetrics?.verifiedProjects || 0, color: '#218C5A' },
    { name: 'Provided', value: latest.reraMetrics?.providedProjects || 0, color: '#E85D3F' },
    { name: 'Not Provided', value: latest.reraMetrics?.notProvidedProjects || 0, color: '#111111' },
  ].filter(d => d.value > 0);

  return (
    <div className="h-64 w-full" role="img" aria-label="RERA coverage pie chart showing verified, provided, and not provided projects.">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid rgba(17,17,17,0.08)' }} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
