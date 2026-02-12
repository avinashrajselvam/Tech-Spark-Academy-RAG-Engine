/**
 * Antigravity RAG — Sample TypeScript Module
 * Priority queue implementation using a binary heap.
 */

interface HeapNode<T> {
    priority: number;
    value: T;
}

class PriorityQueue<T> {
    private heap: HeapNode<T>[] = [];

    /** Number of items in the queue */
    get size(): number {
        return this.heap.length;
    }

    /** Check if the queue is empty */
    get isEmpty(): boolean {
        return this.heap.length === 0;
    }

    /**
     * Insert a value with a given priority.
     * Lower priority numbers are dequeued first.
     * Time complexity: O(log n)
     */
    enqueue(value: T, priority: number): void {
        this.heap.push({ priority, value });
        this._bubbleUp(this.heap.length - 1);
    }

    /**
     * Remove and return the highest-priority item.
     * Time complexity: O(log n)
     */
    dequeue(): T | undefined {
        if (this.isEmpty) return undefined;

        const top = this.heap[0];
        const end = this.heap.pop()!;

        if (this.heap.length > 0) {
            this.heap[0] = end;
            this._sinkDown(0);
        }

        return top.value;
    }

    /**
     * Peek at the highest-priority item without removing it.
     * Time complexity: O(1)
     */
    peek(): T | undefined {
        return this.heap[0]?.value;
    }

    /** Bubble up the element at the given index */
    private _bubbleUp(idx: number): void {
        while (idx > 0) {
            const parentIdx = Math.floor((idx - 1) / 2);
            if (this.heap[parentIdx].priority <= this.heap[idx].priority) break;
            [this.heap[parentIdx], this.heap[idx]] = [this.heap[idx], this.heap[parentIdx]];
            idx = parentIdx;
        }
    }

    /** Sink down the element at the given index */
    private _sinkDown(idx: number): void {
        const length = this.heap.length;
        while (true) {
            let smallest = idx;
            const left = 2 * idx + 1;
            const right = 2 * idx + 2;

            if (left < length && this.heap[left].priority < this.heap[smallest].priority) {
                smallest = left;
            }
            if (right < length && this.heap[right].priority < this.heap[smallest].priority) {
                smallest = right;
            }
            if (smallest === idx) break;

            [this.heap[smallest], this.heap[idx]] = [this.heap[idx], this.heap[smallest]];
            idx = smallest;
        }
    }

    /** Convert to sorted array (drains the queue) */
    toSortedArray(): T[] {
        const result: T[] = [];
        while (!this.isEmpty) {
            result.push(this.dequeue()!);
        }
        return result;
    }
}

/**
 * Dijkstra's shortest path algorithm using the priority queue.
 * Demonstrates practical usage of the PriorityQueue class.
 */
function dijkstra(graph: Map<string, [string, number][]>, start: string): Map<string, number> {
    const distances = new Map<string, number>();
    const pq = new PriorityQueue<string>();

    distances.set(start, 0);
    pq.enqueue(start, 0);

    while (!pq.isEmpty) {
        const current = pq.dequeue()!;
        const currentDist = distances.get(current) ?? Infinity;

        const neighbors = graph.get(current) ?? [];
        for (const [neighbor, weight] of neighbors) {
            const newDist = currentDist + weight;
            const knownDist = distances.get(neighbor) ?? Infinity;

            if (newDist < knownDist) {
                distances.set(neighbor, newDist);
                pq.enqueue(neighbor, newDist);
            }
        }
    }

    return distances;
}

export { PriorityQueue, dijkstra };
