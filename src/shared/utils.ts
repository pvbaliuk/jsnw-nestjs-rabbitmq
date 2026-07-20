export type InFlightDeduper = {
    use: <F extends () => any>(key: string, fn: F) => Promise<Awaited<ReturnType<F>>>;
};

/**
 * Creates a deduplicator for in-flight promises or sync functions.
 * Prevents duplicate executions for the same key while a promise is pending.
 * Clears the entry after settlement.
 * @returns {InFlightDeduper}
 */
export function createInFlightDeduper(): InFlightDeduper{
    const __promises = new Map<string, Promise<any>>();

    function use<F extends () => any>(key: string, fn: F): Promise<Awaited<ReturnType<F>>>{
        let promise = __promises.get(key);
        if(promise)
            return promise;

        promise = Promise.resolve(fn())
            .finally(() => {__promises.delete(key);});

        __promises.set(key, promise);
        return promise;
    }

    return {
        use: use
    };
}
