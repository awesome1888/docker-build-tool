const Util = require('./util.js');
const _ = require('underscore-mixin');
const areFilesEqual = require('fs-equal').areFilesEqual;
const copyFilesSync = require('fs-copy-file-sync');
const BuildContext = require('./context.js');
const webpack = require("webpack");

const WebpackTool = require('./webpack-tool');

module.exports = class Task {
    constructor(includes, application, ctxParams = null) {
        this._includes = includes;
        this._application = application;
        this._firstChange = true;

        if (ctxParams) {
            this.setContext(this.makeContext(ctxParams));
        }
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

    /**
     * Watch all tasks files and re-run tasks
     * @returns object
     */
    async watch(cb) {
        if (!this._watcher) {
            const webpack = await this.getWebPack(this.getContext());
            this._watcher = webpack.watch({
                aggregateTimeout: 200,
                poll: undefined
            }, (err, stats) => {
                if (this._firstChange) {
                    this._firstChange = false;
                } else {
                    if (!err) {
                        cb(stats, this, this.getApplication());
                    }
                }
            });
        }

        return this._watcher;
    }

    async closeWatcher() {
        if (this._watcher) {
            return new Promise((resolve) => {
                this._watcher.close(resolve);
            });
        }
    }

	/**
     * @deprecated
	 * @returns {string|string}
	 */
	getFolder() {
        return this._includes.folder || '';
    }

    makeContext(parameters) {
        return new BuildContext(parameters, this, this.getApplication());
    }

    // this is just dirty...
    setContext(ctx) {
        this._context = ctx;
    }

    getContext() {
	    return this._context || null;
    }

    async build(parameters = null) {
        const ctx = parameters ? this.makeContext(parameters) : this.getContext();

        if (ctx.needInstallNPM()) {
            await this.installNPM(ctx);
        }
        if (ctx.needCopyPackageJson()) {
            await this.copyPackageJson(ctx);
        }

        const webpack = await this.getWebPack(ctx);

	    const p = new Promise((resolve, reject) => {
		    webpack.run((err, stats) => {
			    const tool = new WebpackTool(ctx);

			    tool.log(err, stats).then(() => {
				    resolve();
			    }).catch((e) => {
				    reject(e);
			    });
		    });
	    });

	    const onAfterBuild = this.getOnAfterBuild();
	    if (_.isFunction(onAfterBuild)) {
	        await onAfterBuild(ctx);
        }

	    return p;
    }

    copyPackageJson(ctx = null) {
	    ctx = ctx || this.getContext();
        copyFilesSync(this.getPackageJsonFile(ctx), `${ctx.getDstFolder()}/package.json`);
    }

    getPackageJsonFile(ctx = null) {
        const installTo = this.getIncludes().getSrcFolder(ctx || this.getContext());
        return `${installTo}/package.json`;
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

    getOnAfterBuild() {
        return this.getIncludes().getParameters().onAfterBuild || null;
    }
};
