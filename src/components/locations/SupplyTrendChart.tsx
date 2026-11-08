'use client';

import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export function SupplyTrendChart({ history }: { history: any[] }) {
  if (!history || history.length < 2) {
    return <p className="text-sm text-[#111111]/60">Insufficient historical data to show supply trends.</p>;
  }

  const data = history.map(snap => ({
    date: snap.snapshotDate.split('-').slice(1).join('/'),
    projects: snap.publishedProjectCount,
    resale: snap.resaleListingCount,
    rental: snap.rentalListingCount,
  })).reverse();

  return (
    <div className="h-64 w-full" role="img" aria-label={`Supply trend chart for ${data.length} snapshots showing projects, resale, and rental counts.`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(17,17,17,0.08)" />
          <XAxis dataKey="date" stroke="#111111" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#111111" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid rgba(17,17,17,0.08)' }} 
          />
          <Area type="monotone" dataKey="projects" name="Projects" stroke="#E85D3F" fill="#E85D3F" fillOpacity={0.1} />
          <Area type="monotone" dataKey="resale" name="Resale" stroke="#218C5A" fill="#218C5A" fillOpacity={0.1} />
          <Area type="monotone" dataKey="rental" name="Rental" stroke="#111111" fill="#111111" fillOpacity={0.1} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
