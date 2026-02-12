/**
 * Antigravity RAG — Sample JavaScript Module
 * Event emitter with wildcard pattern matching.
 */

class EventEmitter {
    constructor() {
        this.listeners = new Map();
        this.maxListeners = 10;
    }

    /**
     * Register an event listener.
     * Supports wildcard patterns: 'user.*' matches 'user.created', 'user.updated', etc.
     * @param {string} event - Event name or pattern
     * @param {Function} callback - Listener function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }

        const listeners = this.listeners.get(event);
        if (listeners.length >= this.maxListeners) {
            console.warn(`Warning: ${event} has ${listeners.length} listeners (max: ${this.maxListeners})`);
        }

        listeners.push(callback);

        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Register a one-time event listener.
     * Automatically removes itself after first invocation.
     */
    once(event, callback) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            callback(...args);
        };
        wrapper._original = callback;
        return this.on(event, wrapper);
    }

    /**
     * Remove a specific listener or all listeners for an event.
     */
    off(event, callback) {
        if (!callback) {
            this.listeners.delete(event);
            return;
        }

        const listeners = this.listeners.get(event);
        if (!listeners) return;

        const idx = listeners.findIndex(
            (fn) => fn === callback || fn._original === callback
        );
        if (idx !== -1) listeners.splice(idx, 1);
        if (listeners.length === 0) this.listeners.delete(event);
    }

    /**
     * Emit an event, calling all matching listeners.
     * Supports wildcard matching: emitting 'user.created' will trigger
     * listeners for 'user.created', 'user.*', and '*'.
     * @param {string} event - Event name
     * @param {...*} args - Arguments to pass to listeners
     * @returns {boolean} True if any listeners were called
     */
    emit(event, ...args) {
        let called = false;

        for (const [pattern, listeners] of this.listeners) {
            if (this._matches(pattern, event)) {
                for (const listener of [...listeners]) {
                    try {
                        listener(...args);
                        called = true;
                    } catch (err) {
                        console.error(`Error in listener for ${event}:`, err);
                    }
                }
            }
        }

        return called;
    }

    /**
     * Check if a pattern matches an event name.
     * Supports '*' as wildcard for any single segment,
     * and '**' for any number of segments.
     */
    _matches(pattern, event) {
        if (pattern === event || pattern === '*') return true;

        const patternParts = pattern.split('.');
        const eventParts = event.split('.');

        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i] === '**') return true;
            if (patternParts[i] === '*') continue;
            if (patternParts[i] !== eventParts[i]) return false;
        }

        return patternParts.length === eventParts.length;
    }

    /**
     * Get the number of listeners for an event (or all events).
     */
    listenerCount(event) {
        if (event) return (this.listeners.get(event) || []).length;
        let count = 0;
        for (const listeners of this.listeners.values()) count += listeners.length;
        return count;
    }
}

/**
 * Create a debounced version of a function.
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Create a throttled version of a function.
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum interval in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(fn, limit = 100) {
    let lastCall = 0;
    let timer = null;
    return function (...args) {
        const now = Date.now();
        const remaining = limit - (now - lastCall);
        clearTimeout(timer);
        if (remaining <= 0) {
            lastCall = now;
            fn.apply(this, args);
        } else {
            timer = setTimeout(() => {
                lastCall = Date.now();
                fn.apply(this, args);
            }, remaining);
        }
    };
}

export { EventEmitter, debounce, throttle };
