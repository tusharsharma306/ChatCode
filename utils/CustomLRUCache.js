class CustomLRUCache {
    constructor(capacity = 100, ttl = 3600000) { 
        this.capacity = capacity;
        this.ttl = ttl;
        this.cache = new Map();
        // this.debug = process.env.NODE_ENV === 'development';
        this.debug = true;
    }

    getKey(code, language, input) {
        return `${language}:${input}:${code}`;
    }

    get(code, language, input) {
        const key = this.getKey(code, language, input);
        if (!this.cache.has(key)) {
            this.logDebug(`Cache miss for key: ${key}`);
            return null;
        }

        const item = this.cache.get(key);
        if (Date.now() > item.expiry) {
            this.logDebug(`Cache entry expired for key: ${key}`);
            this.cache.delete(key);
            return null;
        }

        this.logDebug(`Cache hit for key: ${key}`);
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }

    set(code, language, input, value) {
        const key = this.getKey(code, language, input);
        
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        
        if (this.cache.size >= this.capacity) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            this.logDebug(`Removed oldest entry: ${firstKey}`);
        }

        this.cache.set(key, {
            value,
            expiry: Date.now() + this.ttl
        });
        
        this.logDebug(`Added new entry for key: ${key}`);
    }

    clear() {
        this.cache.clear();
        this.logDebug('Cache cleared');
    }

    getSize() {
        return this.cache.size;
    }

    logDebug(message) {
        if (this.debug) {
            console.log(`[LRUCache] ${message}`);
        }
    }
}

module.exports = CustomLRUCache;
