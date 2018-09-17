const _ = require('underscore-mixin');

module.exports = class Queue {
    constructor() {
        this._q = [];
    }

    lock() {
        this._locked = true;
    }

    unlock() {
        this._locked = false;
    }

    push(item) {
        const here = this._q.find((qItem) => {
            return _.deepEqual(qItem, item);
        });
        if (!here) {
            this._q.push(item);
        }
    }

    pushAll(items) {
        if (_.isArrayNotEmpty(items)) {
            items.forEach((item) => {
                this.push(item);
            });
        }
    }

    popAll() {
        const d = this._q;
        this._q = [];

        return d;
    }

    isEmpty() {
        return !_.isArrayNotEmpty(this._q);
    }

    isLocked() {
        return this._locked;
    }
};
