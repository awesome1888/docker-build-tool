const BuildContext = require('./build-context.js');
const Docker = require('./docker.js');
const Util = require('./util.js');
const _ = require('underscore-mixin');
const Task = require('./task.js');

module.exports = class Application {

    constructor(params, project) {
        this._params = params || {};
        this._project = project;
    }

    getParams() {
        return this._params;
    }

    getProject() {
        return this._project;
    }

    getTasks() {
        return [];
    }

    getRootFolder() {
        throw new Error('Not implemented: .getRootFolder()');
    }

    /**
     * Gets application name extracted from it`s root folder path
     * @returns {*}
     */
    getName() {
        if (_.isStringNotEmpty(this._name)) {
            return this._name;
        }

        const location = this.getRootFolder();
        if (_.isStringNotEmpty(location)) {
            return Util.getBaseName(location);
        }

        return '';
    }

    /**
     * Set application name as it is marked in docker-compose file
     * @param name
     */
    setName(name) {
        this._name = name;
    }

    getTaskMap() {
        if (!this._taskMap) {
            this._taskMap = this.getTasks().reduce((result, task) => {
                if (!(task instanceof Task)) {
                    task = new Task(task, this);
                }

                result[task.getName()] = task;
                return result;
            }, {});
        }

        return this._taskMap;
    }

    /**
     * Builds all tasks and then builds the image
     * @param parameters
     * @returns {Promise<void>}
     */
    async buildAll(parameters = {}) {
        // run through all the tasks
        await Promise.all(Object.values(this.getTaskMap()).map((task) => {
            return task.build(parameters);
        }));

        // re-create the image
        const ctx = new BuildContext(parameters, null, this);
        const imageName = ctx.getDockerImageName();

        if (_.isStringNotEmpty(imageName)) {
            const docker = new Docker(ctx);

            // then build an image against the dockerfile
            await docker.build();
        }
    }

    async push(parameters = {}) {
        const ctx = new BuildContext(parameters);

        return Docker.push(ctx);
    }
};
