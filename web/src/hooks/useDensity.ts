import { useCallback, useEffect, useState } from 'react';

export type Density = 'comfortable' | 'compact';

const STORAGE_KEY = 'parallax:density';

function readStored(): Density {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    // Private browsing or blocked storage — fall back to the default.
    return 'comfortable';
  }
}

/**
 * Row density for the data tables. The value is written to <html data-density>,
 * where index.css picks it up via custom properties, so no component needs to
 * know about it.
 */
export function useDensity(): { density: Density; toggle: () => void } {
  const [density, setDensity] = useState<Density>(readStored);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    try {
      localStorage.setItem(STORAGE_KEY, density);
    } catch {
      // Persisting is a convenience; the session still works without it.
    }
  }, [density]);

  const toggle = useCallback(() => {
    setDensity((current) => (current === 'compact' ? 'comfortable' : 'compact'));
  }, []);

  return { density, toggle };
}
