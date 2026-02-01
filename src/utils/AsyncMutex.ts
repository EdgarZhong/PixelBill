export class AsyncMutex {
  private mutex = Promise.resolve();

  lock(): Promise<() => void> {
    let begin: (unlock: () => void) => void = () => {};

    this.mutex = this.mutex.then(() => {
      return new Promise(resolve => {
        begin = resolve;
      });
    });

    return new Promise(resolve => {
      resolve(begin);
    });
  }

  async dispatch<T>(fn: () => Promise<T>): Promise<T> {
    const unlock = await this.lock();
    try {
      return await Promise.resolve(fn());
    } finally {
      unlock();
    }
  }
}
