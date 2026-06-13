// ============================================================
// CricZodiac — Sync Status Context
// ============================================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import { startSyncService, stopSyncService, getSyncStatus } from '../services/SyncService';

const SyncContext = createContext(null);

export const SyncProvider = ({ children }) => {
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncStats, setSyncStats]   = useState({ total: 0, synced: 0, pending: 0, failed: 0 });
  const [isOnline, setIsOnline]     = useState(false);

  useEffect(() => {
    startSyncService((status, stats) => {
      setSyncStatus(status);
      if (stats) setSyncStats(stats);
    });

    // Initial status
    getSyncStatus().then(s => {
      setSyncStats(s);
      setIsOnline(s.is_online);
    });

    return () => stopSyncService();
  }, []);

  return (
    <SyncContext.Provider value={{ syncStatus, syncStats, isOnline }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
};
