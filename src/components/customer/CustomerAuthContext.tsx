'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CustomerDto } from '@/src/domain/customer/entities';

export interface CustomerOtpVerificationResult {
  requiresProfileCompletion: boolean;
  challengeId?: string;
  maskedPhone?: string;
  customer?: CustomerDto;
}

interface CustomerAuthContextType {
  customer: CustomerDto | null;
  loading: boolean;
  isAuthModalOpen: boolean;
  authModalMode: 'login' | 'register';
  openAuthModal: (mode?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  sendOtp: (phone: string) => Promise<{ challengeId: string; expiresInSeconds: number; resendAfterSeconds: number }>;
  verifyOtp: (challengeId: string, otp: string) => Promise<CustomerOtpVerificationResult>;
  completeProfile: (challengeId: string, name: string, email?: string) => Promise<CustomerDto>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

async function readApiResponse(res: Response, fallback: string) {
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    // A generic message is safer than exposing an unexpected server response.
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error || fallback);
  }
  return data;
}

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.customer) {
          setCustomer(data.customer);
          return;
        }
      }
      setCustomer(null);
    } catch {
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const sendOtp = async (phone: string) => {
    const res = await fetch('/api/customer/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await readApiResponse(res, 'We could not send an OTP. Please try again.');
    return {
      challengeId: String(data.challengeId),
      expiresInSeconds: Number(data.expiresInSeconds) || 300,
      resendAfterSeconds: Number(data.resendAfterSeconds) || 30,
    };
  };

  const verifyOtp = async (challengeId: string, otp: string): Promise<CustomerOtpVerificationResult> => {
    const res = await fetch('/api/customer/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, otp }),
    });
    const data = await readApiResponse(res, 'We could not verify that code. Please try again.');
    if (!data.requiresProfileCompletion && data.customer) {
      setCustomer(data.customer);
      closeAuthModal();
    }
    return {
      requiresProfileCompletion: Boolean(data.requiresProfileCompletion),
      challengeId: data.challengeId,
      maskedPhone: data.maskedPhone,
      customer: data.customer,
    };
  };

  const completeProfile = async (challengeId: string, name: string, email?: string): Promise<CustomerDto> => {
    const res = await fetch('/api/customer/auth/profile/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, name, email: email?.trim() || undefined }),
    });
    const data = await readApiResponse(res, 'We could not complete your profile. Please try again.');
    setCustomer(data.customer);
    closeAuthModal();
    return data.customer;
  };

  const logout = async () => {
    try {
      await fetch('/api/customer/auth/logout', { method: 'POST' });
    } finally {
      setCustomer(null);
    }
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        loading,
        isAuthModalOpen,
        authModalMode,
        openAuthModal,
        closeAuthModal,
        sendOtp,
        verifyOtp,
        completeProfile,
        logout,
        refresh,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
}
