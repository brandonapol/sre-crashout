export type Pool = {
  run: <T>(task: () => Promise<T>) => Promise<T>;
  stats: () => { active: number; queued: number; size: number };
};

export const isPoolExhausted = (err: unknown) => err instanceof Error && err.name === "PoolExhausted";

const exhausted = () => Object.assign(new Error("pool queue is full"), { name: "PoolExhausted" });

export const createPool = (size: number, maxQueue: number): Pool => {
  const state = { active: 0 };
  const queue: Array<() => void> = [];

  const release = () => {
    state.active -= 1;
    const next = queue.shift();
    if (next) next();
  };

  const acquire = () =>
    new Promise<void>((resolve, reject) => {
      if (state.active < size) {
        state.active += 1;
        return resolve();
      }
      if (queue.length >= maxQueue) return reject(exhausted());
      queue.push(() => {
        state.active += 1;
        resolve();
      });
    });

  return {
    run: async (task) => {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    stats: () => ({ active: state.active, queued: queue.length, size }),
  };
};
