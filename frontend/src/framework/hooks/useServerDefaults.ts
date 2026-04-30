import { useEffect, useState } from "react";

export interface ServerDefaults {
  provider: string;
  max_tokens: number;
  thinking_budget: number;
  thinking_supported: boolean;
}

export function useServerDefaults() {
  const [defaults, setDefaults] = useState<ServerDefaults | null>(null);

  useEffect(() => {
    fetch("/api/defaults")
      .then((r) => r.json())
      .then((data: ServerDefaults) => setDefaults(data))
      .catch(() => setDefaults(null));
  }, []);

  return defaults;
}
