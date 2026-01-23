const EventEmitter = require("events");

class EventBus extends EventEmitter {
    emitEvent(type, payload) {
        this.emit(type, payload);
    }

    onEvent(type, handler) {
        this.on(type, handler);
    }
}

module.exports = new EventBus();
