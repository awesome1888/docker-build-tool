const _ = require('underscore-mixin');

module.exports = class LogPoller {

    constructor(params, project) {
        this._params = params;
        this._project = project;
        this._halt = false;
        this._lastPolled = {};

        if (!_.isFunction(this._params.onMessage)) {
            throw new Error('No onMessage handler defined');
        }

        this.grepNext = this.grepNext.bind(this);
    }

    getProject() {
        return this._project;
    }

    getParams() {
        return this._params || {};
    }

    halt() {
        this._halt = true;
    }

    async grepNext() {
        const next = () => {
            if (!this._halt) {
                this.spinUp();
            }
        };

        // todo: polling sucks, invent something more clever
        // todo: e.g. https://www.syslog-ng.com/community/b/blog/posts/collecting-logs-containers-using-docker-volumes/

        const schema = Object.values(this.getProject().getApplications());
        const compose = this.getProject().getDockerCompose();

        for (let i = 0; i < schema.length; i++) {
            const app = schema[i];
            const code = app.getName();
            this.getParams().onMessage(app, await compose.getLogs(code, this.getLastPolled(code)));
            this.setLastPolled(code);
        }

        next();
    }

    spinUp() {
        setTimeout(this.grepNext, this.getParams().dockerLogsPollingInterval || 1000);
    }

    setLastPolled(code) {
        // todo: this is inaccurate, because it relies on local time
        this._lastPolled[code] = this.getNow();
    }

    getLastPolled(code) {
        this._lastPolled = this._lastPolled || {};
        return this._lastPolled[code] || null;
    }

    getNow() {
        return Math.round((new Date()).getTime() / 1000);
    }
};
