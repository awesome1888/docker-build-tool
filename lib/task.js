const Util = require('./util.js');
const _ = require('underscore-mixin');
const chokidar = require('chokidar');
const areFilesEqual = require('fs-equal').areFilesEqual;
const copyFilesSync = require('fs-copy-file-sync');
const BuildContext = require('./build-context.js');
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
    // getName() {
    //     if (_.isStringNotEmpty(this._includes.name)) {
    //         return this._includes.name;
    //     }
    //
    //     const folder = this.getFolder();
    //     if (_.isStringNotEmpty(folder)) {
    //         return Util.getBaseName(folder);
    //     }
    //
    //     return 'main';
    // }

	/**
     * @deprecated
	 * @returns {*|null}
	 */
    // getAction() {
    //     return this._includes.action || null;
    // }

    async getWebPack(ctx) {
	    return webpack(this.getIncludes().getWebpackConfiguration(ctx));
    }

    getWatcher() {
        if (!this._watcher) {
            this._watcher = chokidar.watch(this._includes.files, {
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
        return this._includes.folder || '';
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
        const installTo = task.getFolder() || ctx.getApplication().getRootFolder();
        const file = `${installTo}/package.json`;

	    console.dir('install to '+installTo);

        return false;

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
                logger: project.getIncludes().exposeCLI ? project.log : null,
            }).then(() => {
                // copy file
                // todo: replace with async later
                copyFilesSync(file, fileLock);
            });
        }

        return true;
    }

    needRebuildImage() {
        return this._includes.rebuildImage !== false;
    }
};
