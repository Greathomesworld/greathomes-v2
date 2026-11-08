'use client';

import React, { useState, useEffect } from 'react';
import { User, Check, Loader2 } from 'lucide-react';
import { useCustomerAuth } from '@/src/components/customer/CustomerAuthContext';

export default function ProfilePage() {
  const { customer, refresh } = useCustomerAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) {
      setName(customer.name || '');
      setPhone(customer.phone || '');
    }
  }, [customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    setSuccess(false);

    try {
      if (!name.trim()) throw new Error('Name cannot be empty.');

      const res = await fetch('/api/customer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone ? phone.trim() : null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update profile');
      }

      await refresh();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Error updating profile');
    } finally {
      setSaving(false);
    }
  };

  if (!customer) return null;

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h2 className="text-xl font-serif text-slate-900">Buyer Profile Settings</h2>
        <p className="text-xs text-slate-500 font-body mt-0.5">
          Manage your personal contact information for Great Homes assisted home discovery.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-body rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-body rounded-md flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>Profile updated successfully.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-slate-200 rounded-lg p-6 sm:p-8 shadow-xs font-body">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-display">
            Full Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-display">
            Email Address
          </label>
          <input
            type="email"
            disabled
            value={customer.email}
            className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-md text-sm text-slate-500 cursor-not-allowed"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Email address is securely linked to your account and cannot be modified directly.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-display">
            Phone Number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98300 12345"
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-md transition-colors flex items-center gap-2 font-display cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
