const BuildContext = require('./context.js');
const Docker = require('./docker.js');
const Util = require('./util.js');
const _ = require('underscore-mixin');
const Task = require('./task.js');

module.exports = class Application {

    constructor(includes, params, project, ctxParams) {
	    this._tasks = this.makeTasks(includes, ctxParams);
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
        return this._tasks;
    }

	makeTasks(includes, ctxParams) {
		return includes.map(x => new Task(x, this, ctxParams));
    }

    getBuildRootFolder() {
        return this._root;
    }

	setBuildRootFolder(root) {
        this._root = root;
    }

    /**
     * Set application name as it is marked in docker-compose file
     * @param name
     */
    setName(name) {
        this._name = name;
    }

    /**
     * Gets application name extracted from it`s root folder path
     * @returns {*}
     *
     * @deprecated
     */
    getName() {
        if (_.isStringNotEmpty(this._name)) {
            return this._name;
        }

        const location = this.getBuildRootFolder();
        if (_.isStringNotEmpty(location)) {
            return Util.getBaseName(location);
        }

        return '';
    }

    /**
     * Builds all tasks and then builds the image
     * @param parameters
     * @returns {Promise<void>}
     */
    async buildAll(parameters = {}) {
        // run through all the tasks
        await Promise.all(this.getTasks().map((task) => {
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
