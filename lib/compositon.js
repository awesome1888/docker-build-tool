const readYaml = require('read-yaml');
const _ = require('underscore-mixin');
const Util = require('./util.js');

module.exports = class Composition {
    constructor(compositionPath) {
        this._path = compositionPath;
    }

    getDockerComposeFilePath() {
        return this._path || '';
    }

    getData() {
        if (!this._data) {
            this._data = readYaml.sync(this.getDockerComposeFilePath(), {});
        }

        return this._data;
    }

    getSchema() {
        if (!this._devApps) {
            const services = this.getData().services || {};

            const result = {};
            if (_.isObjectNotEmpty(services)) {
                _.forEach(services, (struct, key) => {
                    if (
                        _.isObjectNotEmpty(struct.build)
                        &&
                        _.isStringNotEmpty(struct.build.context)
                        &&
                        _.isStringNotEmpty(struct.build.dockerfile)
                    ) {
                        const item = _.deepClone(struct);
                        item.__code = key;

                        result[key] = item;
                    }
                });
            }

            this._devApps = result;
        }

        return this._devApps;
    }

    getImagePrefix() {
        if (!this._imagePrefix) {
            const file = this.getDockerComposeFilePath();
            this._imagePrefix = Util.getParentName(file);
        }

        return this._imagePrefix;
    }

    makeImageName(application) {
        return `${this.getImagePrefix()}_${application.getName()}`;
    }

    hasApplication(code) {
        return !!this.getDevApps()[code];
    }
};
