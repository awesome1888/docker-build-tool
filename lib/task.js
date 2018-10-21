const Util = require('./util.js');
const _ = require('underscore-mixin');
const chokidar = require('chokidar');
const areFilesEqual = require('fs-equal').areFilesEqual;
const copyFilesSync = require('fs-copy-file-sync');
const BuildContext = require('./context.js');
const webpack = require("webpack");

const WebpackTool = require('./webpack-tool');

module.exports = class Task {
    constructor(includes, application) {
        this._includes = includes;
        this._application = application;
    }

    getIncludes() {
        return this._includes;
    }

    getApplication() {
        return this._application;
    }

	/**
     * @deprecated
	 * @returns {*}
	 */
    getName(ctx) {
		return Util.getBaseName(this.getIncludes().getSrcFolder(ctx || this.getContext()));
    }

    async getWebPack(ctx) {
	    return webpack(await this.getIncludes().getWebpackConfiguration(ctx || this.getContext()));
    }

    getWatcher() {
        // if (!this._watcher) {
        //     this._watcher = chokidar.watch(this._includes.files, {
        //         ignoreInitial: true,
        //         followSymlinks: true,
        //     });
        // }
        //
        // return this._watcher;
    }

	/**
     * @deprecated
	 * @returns {string|string}
	 */
	getFolder() {
        return this._includes.folder || '';
    }

    // this is just dirty...
    setContext(ctx) {
        this._context = ctx;
    }

    getContext() {
	    return this._context || null;
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
        this.setContext(ctx);

        if (ctx.needInstallNPM()) {
            await this.installNPM(ctx);
        }

        const webpack = await this.getWebPack(ctx);

	    return new Promise((resolve, reject) => {
		    webpack.run((err, stats) => {
			    const tool = new WebpackTool(ctx);

			    tool.log(err, stats).then(() => {
				    resolve();
			    }).catch((e) => {
				    reject(e);
			    });
		    });
	    });
    }

    async installNPM(ctx) {
        const task = ctx.getTask();
        const installTo = task.getIncludes().getSrcFolder(ctx);
        const file = `${installTo}/package.json`;

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
            return Util.execute('npm', ['--prefix', installTo, 'install', '--save'], {
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
        return this.getIncludes().getParameters().rebuildImage !== false;
    }
};
