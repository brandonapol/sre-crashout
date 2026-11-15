export const regions = ["us", "eu", "uk", "ca"] as const;

export const skus = (size: number) => Array.from({ length: size }, (_, i) => `Q-${String(2000 + i)}`);
