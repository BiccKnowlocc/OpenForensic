type NetlifyHost = {
  Netlify?: {
    env?: {
      get: (name: string) => string | undefined;
    };
  };
};

export function readEnv(name: string): string | undefined {
  return (globalThis as NetlifyHost).Netlify?.env?.get(name);
}
