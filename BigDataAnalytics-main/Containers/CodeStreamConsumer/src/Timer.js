class Timer {
    static #timers = new WeakMap();

    static start(obj) {
        const timers = {};
        timers.total = process.hrtime.bigint();
        Timer.#timers.set(obj, timers);
        return obj;
    }

    static lap(obj, name) {
        const timers = Timer.#timers.get(obj);
        if (!timers) return;
        
        // End previous lap if exists
        if (timers.currentLap) {
            const lapEnd = process.hrtime.bigint();
            timers[timers.currentLap] = lapEnd - timers.lapStart;
        }
        
        // Start new lap
        timers.currentLap = name;
        timers.lapStart = process.hrtime.bigint();
    }

    static stop(obj) {
        const timers = Timer.#timers.get(obj);
        if (!timers) return;

        // End last lap if exists
        if (timers.currentLap) {
            const lapEnd = process.hrtime.bigint();
            timers[timers.currentLap] = lapEnd - timers.lapStart;
            delete timers.currentLap;
            delete timers.lapStart;
        }

        // Calculate total time
        timers.total = process.hrtime.bigint() - timers.total;
    }

    static getTimers(obj) {
        return Timer.#timers.get(obj) || {};
    }
}

module.exports = Timer;
