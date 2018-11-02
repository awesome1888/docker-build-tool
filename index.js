const _ = require('underscore-mixin');
const Composition = require('./lib/compositon.js');
const Util = require('./lib/util.js');
const Path = require('./lib/path.js');
const chokidar = require('chokidar');
const Queue = require('./lib/queue.js');
const DockerCompose = require('./lib/docker-compose.js');
const LogPoller = require('./lib/log-poller.js');
const BuildContext = require('./lib/context.js');
const Docker = require('./lib/docker.js');
const Application = require('./lib/application.js');
const WebpackTool = require('./lib/webpack-tool.js');

const MainClass = class Project {
    constructor(options = {}) {
        this._options = options;
        this._streams = {};
        this._watches = [];

        this.buildNext = this.buildNext.bind(this);
        this.buildImagesNext = this.buildImagesNext.bind(this);
        this.compositionRestartNext = this.compositionRestartNext.bind(this);

        this.log = this.log.bind(this);
    }

    getName() {
        return this.getParams().name;
    }

	getProjectFolder() {
		return this.getParams().projectFolder;
	}

    getParams() {
        return this._options || {};
    }

    async run() {
	    console.dir(`Project folder: ${this.getProjectFolder()}`);
	    console.dir(`Compose file: ${this.getCompositionFile()}`);

        // pre-checks
        const haveDockerCompose = await Util.testCmd('docker-compose -v', 'docker-compose version').catch(() => {
            return false;
        });
        if (!haveDockerCompose) {
            this.log('It seems you don\'t have docker-compose yet. Please, consider installing docker-compose for your operation system.');
            return;
        }

        const destinationFolder = _.isStringNotEmpty(this.getParams().destinationFolder) ? this.getParams().destinationFolder : '#TASK_FOLDER#build/#MODE_NAME#/';
        const params = {
            production: false,
            temporarySubFolder: this.getTemporarySubFolder(),
            destinationFolder,
        };

        const apps = this.getApplications(params);

        // spin-up all loops and watch files
        this.hangOnSigInt();
        this.spinUpBuildLoop();
        this.spinUpBuildImagesLoop();
        this.spinUpCompositionRestartLoop();
        this.getLogPoller().spinUp();

        // 1) build all
        this.getAllTasks().forEach((task) => {
            console.dir(task.getPackageJsonFile());
            const app = task.getApplication();
            this.orderToBuild(app, task, {
                ...params,
                stdoutTo: this.getStream(app),
                stderrTo: this.getStream(app),
            });
        });

        // 2) watch all tasks
        await Promise.all(this.getAllTasks().map(task => {

            // watch package.json
            this._watches.push(this.watch(task.getPackageJsonFile(), 'change', () => {
                const app = task.getApplication();
                this.orderToBuild(app, task, {
                    ...params,
                    stdoutTo: this.getStream(app),
                    stderrTo: this.getStream(app),
                });
            }));

            // watch source code
            return task.watch(
              (stats, task, app) => {
                  this.orderToBuild(app, task, {
                      ...params,
                      stdoutTo: this.getStream(app),
                      stderrTo: this.getStream(app),
                  });
              }
            );
        }));

        // todo: watch each app dockerfile

        // docker-compose
        this._watches.push(this.watch(this.getCompositionFile(), 'change', () => {
            this.orderToRestartComposition();
        }));

        this.log('Watching files...');
    }

    watch(what, eventType, cb) {
        const watcher = chokidar.watch(what, {
            ignoreInitial: true,
            followSymlinks: true,
        });
        watcher.on(eventType, cb);

        return watcher;
    }

    getAllTasks() {
        let tasks = [];
        this.getApplications().forEach((app) => {
            tasks = _.union(tasks, app.getTasks());
        });

        return tasks;
    }

    informActionFailed(change) {
        if (_.isFunction(this.getParams().onActionFailed)) {
            this.getParams().onActionFailed(change, this);
        } else {
            this.log(`Build failed for ${change.application.getName()}:${change.task.getName()}`);
        }
    }

    informImageBuildFailed(change) {
        if (_.isFunction(this.getParams().onImageBuildFailed)) {
            this.getParams().onImageBuildFailed(change, this);
        } else {
            this.log(`Image build failed for ${change.application.getName()}`);
        }
    }

    orderToBuild(application, task, params) {
        const q = this.getBuildQueue();
        q.push({application, task, params});
    }

    orderToRestartComposition() {
        this.getCompositionRestartQueue().push('have-you-tried-to-switch-off-and-on-again');
    }

    // ///////////////////////
    // queue management

    getBuildQueue() {
        if (!this._buildQueue) {
            this._buildQueue = new Queue();
        }

        return this._buildQueue;
    }

    spinUpBuildLoop() {
        setTimeout(this.buildNext, 300);
    }

    buildNext() {
        const bq = this.getBuildQueue();
        const biq = this.getBuildImagesQueue();

        const next = () => {
            if (!this._halt) {
                this.spinUpBuildLoop();
            }
        };

        if (bq.isLocked()) {
            // do nothing, go to the next cycle iteration
            next();
            return;
        }

        if (bq.isEmpty()) {
            biq.unlock();
            next();
            return;
        }

        const all = bq.popAll();
        let failure = false;

        this.log('Rebuilding sources...');
        Promise.all(all.map((change) => {
            return change.task.build(change.params).catch(() => {
                failure = true;
                this.informActionFailed(change);
            });
        })).then(() => {
            if (!failure) {
                const images = [];
                const names = [];
                const imageNames = {};
                all.forEach((change) => {
                    if (change.task.needRebuildImage() && !imageNames[change.application.getName()]) {
                        images.push(change);
                        imageNames[change.application.getName()] = true;
                    }

                    names.push(`${change.application.getName()}:${change.task.getName()}`);
                });

                // tell to build images next
                if (_.isArrayNotEmpty(images)) {
                    biq.pushAll(images);
                }

                this.log(`Done (${names.join(', ')})`);
            }

            next();
        }).catch((e) => {
            console.dir(e);
            // =(
            next();
        });
    }

    getBuildImagesQueue() {
        if (!this._buildImagesQueue) {
            this._buildImagesQueue = new Queue();
        }

        return this._buildImagesQueue;
    }

    spinUpBuildImagesLoop() {
        setTimeout(this.buildImagesNext, 300);
    }

    buildImagesNext() {
        const next = () => {
            if (!this._halt) {
                this.spinUpBuildImagesLoop();
            }
        };

        const biq = this.getBuildImagesQueue();

        if (biq.isLocked()) {
            next();
            return;
        }

        if (biq.isEmpty()) {
            // start re-compose
            next();
            return;
        }

        const all = biq.popAll();
        biq.lock();

        let failure = false;

        this.log('Rebuilding images...');
        Promise.all(all.map((change) => {

            const ctx = new BuildContext(change.params, null, change.application);
            ctx.setDockerImageName(this.getComposition().makeImageName(change.application));
            const docker = new Docker(ctx);

            return docker.build().catch((e) => {
                failure = true;
                console.dir(e);
                this.informImageBuildFailed(change);
            });
        })).then(() => {

            if (!failure) {
                const names = [];

                all.forEach((change) => {
                    names.push(`${this.getComposition().makeImageName(change.application)}`);
                });

                this.log(`Done (${names.join(', ')})`);
                this.orderToRestartComposition();
            }

            next();
        }).catch(() => {
            // =(
            next();
        });
    }

    getCompositionRestartQueue() {
        if (!this._compositionRestartQueue) {
            this._compositionRestartQueue = new Queue();
        }

        return this._compositionRestartQueue;
    }

    spinUpCompositionRestartLoop() {
        setTimeout(this.compositionRestartNext, 300);
    }

    compositionRestartNext() {
        const crq = this.getCompositionRestartQueue();

        const next = () => {
            if (!this._halt) {
                this.spinUpCompositionRestartLoop();
            }
        };

        if (crq.isEmpty()) {
            next();
            return;
        }

        crq.popAll(); // just wipe out the queue

        this.log('Restarting composition...');
        this.getDockerCompose().up().then(() => {
            this.log('Done');
            next();
        }).catch(() => {
            this.log('Error: was not able to restart the composition');
        });
    }

    // ///////////////////////
    // aux getters

    getApplications(params = {}) {
        if (!this._applications) {
            const composition = this.getComposition().getSchema();
            const dockerBase = Util.getParentPath(this.getCompositionFile());

	        console.dir(`Docker base: ${dockerBase}`);

            const apps = [];

            // parse dockerfile composition and get build instructions
            Object.values(composition).forEach((app) => {
                const context = _.getValue(app, 'build.context');
                if (!_.isStringNotEmpty(context)) {
                    throw new Error(`Illegal context for app ${app.__code}`);
                }
                const dstRoot = `${dockerBase}/${app.build.context}/`;

	            console.dir(`Docker context for the app "${app.__code}": ${dstRoot}`);

                // here we resolve webpack files...
                const files = this.resolveWebpackFiles(dstRoot);
	            if (!_.isArrayNotEmpty(files)) {
	                throw new Error(`Nothing to do for application ${app.__code} (no webpack files detected)`);
	            }
	            const application = new Application(this.include(files, app.__code), this.getParams(), this, params);
	            application.setBuildRootFolder(dstRoot);
	            application.setName(app.__code);

	            apps.push(application);
            });

            this._applications = apps;
        }

        return this._applications;
    }

	include(files, appCode) {
		const result = [];

		files.forEach((file) => {
			const inc = require(file);
			const res = {};

			// look for main builder
			if (_.isFunction(inc)) {
				res.getWebpackConfiguration = inc;
			} else if(_.isFunction(inc.getWebpackConfiguration)) {
			    res.getWebpackConfiguration = inc.getWebpackConfiguration;
            }

            res.getSrcFolder = _.isFunction(inc.getSrcFolder) ? inc.getSrcFolder : null;
            res.getParameters = _.isFunction(inc.getParameters) ? inc.getParameters : () => ({});

            // check
            if (!_.isFunction(res.getWebpackConfiguration)) {
                throw new Error(`Webpack configurator does not export .getWebpackConfiguration() function for app "${appCode}": ${file}`);
            }
			if (!_.isFunction(res.getSrcFolder)) {
				throw new Error(`Webpack configurator does not export .getSrcFolder() function for app "${appCode}": ${file}`);
			}

			result.push(res);
        });

		return result;
    }

	resolveWebpackFiles(root) {
        const result = [];

        const one = `${root}/webpack.js`;
        if (Util.testFile(one)) {
            result.push(one);
        } else {
            const sub = `${root}/webpack/`;
            if (Util.testFolder(sub)) {
                return Util.readFolder(sub).map(x => `${sub}/${x}`).filter(x => Util.testFile(x));
            }
        }

        return result;
    }

    getComposition() {
        if (!this._composition) {
            this._composition = new Composition(this.getCompositionFile());
        }

        return this._composition;
    }

    getCompositionFile() {
        if (!_.isStringNotEmpty(this._options.composeFile)) {
            throw new Error('Composition file not specified: composeFile');
        }

        return this._options.composeFile;
    }

    getDockerCompose() {
        if (!this._dockerCompose) {
            this._dockerCompose = new DockerCompose({
                stdoutTo: process.stdout,
                stderrTo: process.stdout,
                dockerComposeFilePath: this.getCompositionFile(),
                logger: this.getParams().exposeCLI ? this.log : null,
            });
        }

        return this._dockerCompose;
    }

    onDockerLogMessage(application, messages) {
        this.getStream(application).write(messages);
    }

    getLogPoller() {
        if (!this._logPoller) {
            this._logPoller = new LogPoller({
                onMessage: this.onDockerLogMessage.bind(this),
                ...this.getParams()
            }, this);
        }

        return this._logPoller;
    }

    hasLogPoller() {
        return !!this._logPoller;
    }

    hangOnSigInt() {
        const halt = () => {
            this.log('Bye-bye');
            process.exit(0);
        };
        const stop = () => {
            this._halt = true;
            this.getBuildQueue().lock();
            if (this.hasLogPoller()) {
                this.getLogPoller().halt();
            }

            // todo: stop all this._watches

            return this.closeStreams().then(() => {
                return this.getAllTasks().map(t => t.closeWatcher());
            }).then(() => {
                halt();
            });
        };

        process.on('SIGINT', () => {
            if (this._dcStopped) {
                stop();
            } else {
                this.getDockerCompose().stop().then(() => {
                    this._dcStopped = true;
                    return stop();
                }).catch((e) => {
                    this.log(`Error while exiting: ${e}`);
                    halt();
                });
            }
        });
    }

    getStream(application) {
        const code = application.getName();
        if (!this._streams[code]) {

            const path = Path.fillTemplate(`${Path.getToolTemporaryFolder()}/${this.getTemporarySubFolder()}/log/`, {
                application,
            });

            console.dir(`Stream requested: "${`${path}/output`}"`);
            this._streams[code] = Util.makeStream(`${path}/output`);
        }

        return this._streams[code];
    }

    async closeStreams() {
        let toWait = [];

        if (_.isObjectNotEmpty(this._streams)) {
            toWait = Object.values(this._streams).map((stream) => {
                return new Promise((resolve) => {
                    stream.end(() => {
                        resolve();
                    });
                });
            });
        }

        return Promise.all(toWait);
    }

    log(data) {
        if (data) {
            console.log(data.toString().replace(/(\r\n|\r|\n)+$/g, ''));
        }
    }

	getTemporarySubFolder() {
		return `${this.getName()}/#APPLICATION_NAME#/`;
	}
};

module.exports = MainClass;
module.exports.default = MainClass;
module.exports.Application = Application;
module.exports.WebpackTool = WebpackTool;
module.exports.Util = Util;
