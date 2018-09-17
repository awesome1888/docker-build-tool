const Util = require('./util.js');
const Path = require('./path.js');
const _ = require('underscore-mixin');

module.exports = class BuildContext {
    constructor(params, task, application) {
        this._params = params;
        this._task = task;
        this._application = application;
        this._imageName = null;
    }

    /**
     * Get a reference to the application
     * @returns {*}
     */
    getApplication() {
        return this._application;
    }

    /**
     * Get a reference to the task
     * @returns {*|null}
     */
    getTask() {
        return this._task || null;
    }

    getTaskCode() {
        const folder = this.getTask().getFolder() || this.getApplication().getRootFolder();

        return Util.getBaseName(folder);
    }

    getMode() {
        return this._params.production === true ? 'production' : 'development';
    }

    /**
     * Returns a path to the source of the application (or the application task)
     * @returns {string}
     */
    getSrcFolder() {
        let folder = this.getTask().getFolder();
        if (!_.isStringNotEmpty(folder)) {
            folder = this.getApplication().getRootFolder();
        }

        return `${folder}/src/`;
    }

    /**
     * Returns a path of the folder where to put webpack output
     * @returns {string|*}
     */
    getDstFolder() {
        let dst = this._params.destinationFolder;
        if (!_.isStringNotEmpty(dst)) {
            dst = this.getTemporaryFolder('build/#TASK_NAME#/#MODE_NAME#/');
        }

        return Path.fillTemplate(dst, {
            context: this,
        });
    }

    async provideDstFolder() {
        return Util.makeFolder(this.getDstFolder());
    }

    /**
     * Returns a path to the dockerfile for the application
     * @returns {*}
     */
    getDockerfilePath() {
        const dir = `${this.getApplication().getRootFolder()}/docker/`;
        const mode = this.getMode();

        let file = `${dir}${mode}.dockerfile`;
        if (Util.testFile(file)) {
            return file;
        }

        file = `${dir}${mode}.docker`;
        if (Util.testFile(file)) {
            return file;
        }

        file = `${dir}${mode}`;
        if (Util.testFile(file)) {
            return file;
        }

        return null;
    }

    getDockerImageName() {
        return this._imageName || this._params.dockerImageName || null;
    }

    setDockerImageName(name) {
        this._imageName = name;
    }

    getStdoutTo() {
        return this._params.stdoutTo || null;
    }

    getStderrTo() {
        return this._params.stderrTo || null;
    }

    // ///////////////////

    async log(data, isError = false) {
        if (data) {
            const stream = isError ? this.getStderrTo() : this.getStdoutTo();
            if (stream) {
                stream.write(data);
            }
        }
    }

    async provideFolder(folder) {
        return Util.makeFolder(folder);
    }

    getTemporaryFolder(tail = '') {
        const middle = _.isStringNotEmpty(this._params.temporarySubFolder) ? this._params.temporarySubFolder : '#CONTEXT_ID#/';
        return Path.fillTemplate(`${Path.getToolTemporaryFolder()}/${middle}/${tail}`, {
            context: this,
        });
    }

    getHardSourcePluginFolder() {
        return this.getTemporaryFolder('cache/#TASK_NAME#/[confighash]/');
    }

    needInstallNPM() {
        return this._params.useNPM !== false;
    }
};
