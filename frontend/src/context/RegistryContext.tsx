import React, { createContext, useContext, useEffect, useState } from 'react';
import { RegistryOut, RegistryAlgorithm } from '../types/api';
import { ecdatApi } from '../api/endpoints';

interface RegistryContextType {
  registry: RegistryOut | null;
  loading: boolean;
  error: string | null;
  resolveAlgorithm: (name: string) => RegistryAlgorithm | undefined;
  resolveOid: (oid: string) => string | undefined;
}

const RegistryContext = createContext<RegistryContextType>({
  registry: null,
  loading: true,
  error: null,
  resolveAlgorithm: () => undefined,
  resolveOid: () => undefined,
});

export const RegistryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [registry, setRegistry] = useState<RegistryOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    ecdatApi.getRegistry()
      .then(res => {
        if (mounted) {
          setRegistry(res.data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (mounted) {
          setError(err.message || 'Failed to load algorithm registry');
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const resolveAlgorithm = (name: string): RegistryAlgorithm | undefined => {
    if (!registry || !registry.algorithms) return undefined;
    const lower = name.toLowerCase();
    return registry.algorithms.find(
      a => a.canonical_name.toLowerCase() === lower || (a.oid && a.oid.toLowerCase() === lower)
    );
  };

  const resolveOid = (oid: string): string | undefined => {
    if (!registry || !registry.oids) return undefined;
    return registry.oids[oid];
  };

  return (
    <RegistryContext.Provider value={{ registry, loading, error, resolveAlgorithm, resolveOid }}>
      {children}
    </RegistryContext.Provider>
  );
};

export const useRegistry = () => useContext(RegistryContext);
