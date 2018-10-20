const Util = require('./util.js');
const _ = require('underscore-mixin');
const chokidar = require('chokidar');
const areFilesEqual = require('fs-equal').areFilesEqual;
const copyFilesSync = require('fs-copy-file-sync');
const BuildContext = require('./build-context.js');
const webpack = require("webpack");

const WebpackTool = require('./webpack-tool');

module.exports = class Task {
    constructor(params, application) {
        this._params = params;
        this._application = application;
    }

    getParams() {
        return this._params;
    }

    getApplication() {
        return this._application;
    }

	/**
     * @deprecated
	 * @returns {*}
	 */
	getName() {
        if (_.isStringNotEmpty(this._params.name)) {
            return this._params.name;
        }

        const folder = this.getFolder();
        if (_.isStringNotEmpty(folder)) {
            return Util.getBaseName(folder);
        }

        return 'main';
    }

	/**
     * @deprecated
	 * @returns {*|null}
	 */
	getAction() {
        return this._params.action || null;
    }

    async getWebPack(ctx) {
	    const params = this.getParams();
	    let settings = {};
	    if (_.isFunction(params)) {
		    settings = await params(ctx);
        } else {
	        settings = params;
        }

	    return webpack(settings);
    }

    getWatcher() {
        if (!this._watcher) {
            this._watcher = chokidar.watch(this._params.files, {
                ignoreInitial: true,
                followSymlinks: true,
            });
        }

        return this._watcher;
    }

	/**
     * @deprecated
	 * @returns {string|string}
	 */
	getFolder() {
        return this._params.folder || '';
    }

    /**
     * Watch all tasks files and re-run tasks
     * @returns void
     */
    watch(cb) {
        this.getWatcher().on('all', cb);
    }

    async build(parameters = {}) {
        const ctx = new BuildContext(parameters, this, this.getApplication());
	    console.dir('ctx:');
	    console.dir(ctx);
        if (ctx.needInstallNPM()) {
            await this.installNPM(ctx);
        }

        const webpack = await this.getWebPack(ctx);

	    return new Promise((resolve, reject) => {
		    webpack.run((err, stats) => {
			    const tool = new WebpackTool(ctx);

			    console.dir(err);
			    console.dir(stats);

			    tool.log(err, stats).then(() => {
				    resolve();
			    }).catch(() => {
				    reject();
			    });
		    });
	    });
    }

    async installNPM(ctx) {
        const task = ctx.getTask();
        const folder = task.getFolder() || ctx.getApplication().getRootFolder();
        const file = `${folder}/package.json`;

        if (!Util.testFile(file)) {
            return false;
        }

        const tmp = await ctx.provideFolder(ctx.getTemporaryFolder('npm/#TASK_NAME#/#MODE_NAME#/'));
        const fileLock = `${tmp}/.packagejsonprev`;

        let equal = false;
        try {
            equal = await areFilesEqual(file, fileLock);
        } catch (e) {
        }

        if (!equal) {
            const project = this.getApplication().getProject();
            return Util.execute('npm', ['--prefix', folder, 'install', '--save'], {
                stdoutTo: ctx.getStdoutTo(),
                stdoutErr: ctx.getStderrTo(),
                logger: project.getParams().exposeCLI ? project.log : null,
            }).then(() => {
                // copy file
                // todo: replace with async later
                copyFilesSync(file, fileLock);
            });
        }

        return true;
    }

    needRebuildImage() {
        return this._params.rebuildImage !== false;
    }
};
