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

/**
 * Splits an array into smaller arrays of a specified size.
 *
 * @template T
 * @param {T[]} arr - The array to be split into chunks.
 * @param {number} chunk_size - The size of each chunk.
 * @returns {T[][]} An array containing the chunks.
 */
export const chunk = <T extends any>(arr: T[], chunk_size: number): T[][] => {
    if(chunk_size <= 0)
        throw new TypeError('Chunk size should be greater than 0');

    return Array.from({
            length: Math.ceil(arr.length / chunk_size)},
        (_, i) => arr.slice(i * chunk_size, i * chunk_size + chunk_size)
    );
}
