const exec = require('child_process').exec;
const _ = require('underscore-mixin');
const Util = require('./util.js');

module.exports = class DockerCompose {

    constructor(params) {
        this._params = params;
        this.invalidateCache();
    }

    invalidateCache() {
        this._cache = {};
        this.invalidateIdCache();
    }

    invalidateIdCache() {
        this._cache.ids = {};
    }

    up(args = []) {
        if (!_.isArray(args)) {
            args = [];
        }
        return this.executeCompose(['up', '-d', ...args]).then(() => {
            this.invalidateIdCache();
        });
    }

    stop() {
        return this.executeCompose(['stop']);
    }

    async getLogs(application, since = null) {
        const id = await this.getContainerId(application);
        if (!_.isStringNotEmpty(id)) {
            return '';
        }

        return new Promise((resolve) => {
            exec(`docker logs ${since !== null ? `--since ${since}` : ''} ${id}`, (err, stdout, stderr) => {
                if (err) {
                    resolve('');
                } else {
                    // todo: this sucks because lines of stdout and stderr can be mixed up in real life
                    resolve(`${stdout}${stderr}`);
                    // resolve(stderr);
                }
            });
        });
    }

    /**
     * Returns a container id by the application name
     * @param applicationName
     * @returns {Promise<*>}
     */
    async getContainerId(applicationName) {
        if (this._cache.ids[applicationName]) {
            return this._cache.ids[applicationName];
        }

        return new Promise((resolve) => {
            exec(`docker ps | grep docker_${applicationName}`, (err, stdout) => {
                if (err) {
                    resolve('');
                } else {
                    const id = stdout.toString().split(/\s/)[0];

                    if (_.isStringNotEmpty(id)) {
                        this._cache.ids[applicationName] = id;
                    }
                    resolve(id);
                }
            });
        });
    }

    executeCompose(args = []) {
        if (!_.isArray(args)) {
            args = [];
        }
        return Util.execute(
            'docker-compose',
            ['-f', this._params.dockerComposeFilePath, ...args],
            this._params
        );
    }
};
