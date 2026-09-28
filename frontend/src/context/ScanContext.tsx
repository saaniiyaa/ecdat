import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { ScanOut, WorkspaceOut, ScanEventOut, HealthOut, ScanCreate } from '../types/api';
import { ecdatApi } from '../api/endpoints';

interface ScanContextType {
  health: HealthOut | null;
  systemOnline: boolean;
  workspaces: WorkspaceOut[];
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
  scans: ScanOut[];
  activeScanId: string | null;
  activeScan: ScanOut | null;
  setActiveScanId: (id: string | null) => void;
  loadingScans: boolean;
  refreshScans: () => Promise<void>;
  events: ScanEventOut[];
  refreshScanEvents: () => Promise<void>;
  startNewScan: (data: ScanCreate, waitSeconds?: number) => Promise<ScanOut>;
  cancelCurrentScan: () => Promise<void>;
  retryCurrentScan: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const ScanContext = createContext<ScanContextType>({} as ScanContextType);

const ACTIVE_SCAN_STORAGE_KEY = 'ecdat_active_scan_id';

export const ScanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [health, setHealth] = useState<HealthOut | null>(null);
  const [systemOnline, setSystemOnline] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceOut[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanOut[]>([]);
  const [activeScanId, setActiveScanIdState] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_SCAN_STORAGE_KEY);
  });
  const [activeScan, setActiveScan] = useState<ScanOut | null>(null);
  const [loadingScans, setLoadingScans] = useState(false);
  const [events, setEvents] = useState<ScanEventOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  const setActiveScanId = useCallback((id: string | null) => {
    setActiveScanIdState(id);
    if (id) {
      localStorage.setItem(ACTIVE_SCAN_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_SCAN_STORAGE_KEY);
    }
  }, []);

  // Check health and load initial workspaces
  useEffect(() => {
    let mounted = true;
    const checkSystem = async () => {
      try {
        const res = await ecdatApi.getHealth();
        if (mounted) {
          setHealth(res.data);
          setSystemOnline(true);
        }
      } catch (err) {
        if (mounted) {
          setSystemOnline(false);
        }
      }
    };

    checkSystem();
    const timer = setInterval(checkSystem, 15000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const res = await ecdatApi.listWorkspaces();
      setWorkspaces(res.data || []);
    } catch {
      // Workspaces might be empty initially
    }
  }, []);

  const refreshScans = useCallback(async () => {
    setLoadingScans(true);
    try {
      const res = await ecdatApi.listScans(activeWorkspaceId || undefined);
      const items = res.data || [];
      setScans(items);

      // If active scan not selected or not in list, select the newest
      if (items.length > 0) {
        if (!activeScanId || !items.some(s => s.id === activeScanId)) {
          setActiveScanId(items[0].id);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load scans');
    } finally {
      setLoadingScans(false);
    }
  }, [activeWorkspaceId, activeScanId, setActiveScanId]);

  // Load workspaces and scans on startup
  useEffect(() => {
    refreshWorkspaces();
    refreshScans();
  }, [refreshWorkspaces, refreshScans]);

  // Track active scan details
  useEffect(() => {
    if (!activeScanId) {
      setActiveScan(null);
      setEvents([]);
      return;
    }

    let mounted = true;
    const loadScanDetails = async () => {
      try {
        const res = await ecdatApi.getScan(activeScanId);
        if (mounted) {
          setActiveScan(res.data);
        }
      } catch (err: any) {
        // active scan might be invalid
      }
    };

    loadScanDetails();

    // If active scan is running or queued, poll it and its events
    const scanInList = scans.find(s => s.id === activeScanId);
    let pollTimer: any = null;
    if (scanInList && (scanInList.status === 'running' || scanInList.status === 'queued')) {
      pollTimer = setInterval(async () => {
        loadScanDetails();
        try {
          const ev = await ecdatApi.getScanEvents(activeScanId);
          if (mounted) setEvents(ev.data || []);
        } catch {}
      }, 1000);
    }

    return () => {
      mounted = false;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [activeScanId, scans]);

  const refreshScanEvents = useCallback(async () => {
    if (!activeScanId) return;
    try {
      const res = await ecdatApi.getScanEvents(activeScanId);
      setEvents(res.data || []);
    } catch {}
  }, [activeScanId]);

  const startNewScan = async (data: ScanCreate, waitSeconds = 0): Promise<ScanOut> => {
    setError(null);
    try {
      const res = await ecdatApi.createScan(data, waitSeconds);
      const newScan = res.data;
      await refreshScans();
      if (newScan && newScan.id) {
        setActiveScanId(newScan.id);
      }
      return newScan;
    } catch (err: any) {
      setError(err.message || 'Failed to initiate scan');
      throw err;
    }
  };

  const cancelCurrentScan = async () => {
    if (!activeScanId) return;
    try {
      await ecdatApi.cancelScan(activeScanId);
      await refreshScans();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel scan');
    }
  };

  const retryCurrentScan = async () => {
    if (!activeScanId) return;
    try {
      const res = await ecdatApi.retryScan(activeScanId);
      await refreshScans();
      if (res.data?.id) {
        setActiveScanId(res.data.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to retry scan');
    }
  };

  return (
    <ScanContext.Provider
      value={{
        health,
        systemOnline,
        workspaces,
        activeWorkspaceId,
        setActiveWorkspaceId,
        scans,
        activeScanId,
        activeScan,
        setActiveScanId,
        loadingScans,
        refreshScans,
        events,
        refreshScanEvents,
        startNewScan,
        cancelCurrentScan,
        retryCurrentScan,
        error,
        clearError: () => setError(null),
      }}
    >
      {children}
    </ScanContext.Provider>
  );
};

export const useScan = () => useContext(ScanContext);
