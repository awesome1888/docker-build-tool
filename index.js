const _ = require('underscore-mixin');
const Composition = require('./lib/compositon.js');
const Util = require('./lib/util.js');
const Path = require('./lib/path.js');
const chokidar = require('chokidar');
const Queue = require('./lib/queue.js');
const DockerCompose = require('./lib/docker-compose.js');
const LogPoller = require('./lib/log-poller.js');
const BuildContext = require('./lib/build-context.js');
const Docker = require('./lib/docker.js');
const Application = require('./lib/application.js');
const WebpackTool = require('./lib/webpack-tool.js');

const MainClass = class Project {
    constructor(options = {}) {
        this._options = options;
        this._streams = {};

        this.buildNext = this.buildNext.bind(this);
        this.buildImagesNext = this.buildImagesNext.bind(this);
        this.compositionRestartNext = this.compositionRestartNext.bind(this);
    }

    getName() {
        return this.getParams().name;
    }

    getTemporarySubFolder() {
        return `${this.getName()}/#APPLICATION_NAME#/`;
    }

    getParams() {
        return this._options || {};
    }

    async run() {
        const apps = this.getApplications();
        const destinationFolder = _.isStringNotEmpty(this.getParams().destinationFolder) ? this.getParams().destinationFolder : '#TASK_FOLDER#build/#MODE_NAME#/';

        // spin-up all loops and watch files
        this.hangOnSigInt();
        this.spinUpBuildLoop();
        this.spinUpBuildImagesLoop();
        this.spinUpCompositionRestartLoop();
        this.getLogPoller().spinUp();

        const params = {
            production: false,
            temporarySubFolder: this.getTemporarySubFolder(),
            destinationFolder,
        };

        // 1) build all
        apps.forEach((app) => {
            Object.values(app.getTaskMap()).forEach((task) => {
                this.orderToBuild(app, task, {
                    ...params,
                    stdoutTo: this.getStream(app),
                    stderrTo: this.getStream(app),
                });
            });
        });

        // 2) watch all
        apps.forEach((app) => {
            Object.values(app.getTaskMap()).forEach((task) => {
                // all src files
                task.watch(() => {
                    this.orderToBuild(app, task, {
                        production: false,
                        temporarySubFolder: this.getTemporarySubFolder(),
                        destinationFolder,
                        stdoutTo: this.getStream(app),
                        stderrTo: this.getStream(app),
                    });
                });
                // all package.json-s
                // todo
            });

            // all dockerfiles
            // todo
        });

        // docker-compose
        this._watcherDockerCompose = chokidar.watch(this.getCompositionFile(), {
            ignoreInitial: true,
            followSymlinks: true,
        });
        this._watcherDockerCompose.on('change', () => {
            this.orderToRestartComposition();
        });

        this.log('Watching files...');
    }

    informActionFailed(change) {
        if (_.isFunction(this.getParams().onActionFailed)) {
            this.getParams().onActionFailed(change, this);
        } else {
            this.log(`Build failed, look for details: ./script/log.sh ${change.application.getName()}`);
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
                all.forEach((change) => {
                    if (change.task.needRebuildImage()) {
                        images.push(change);
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
        }).catch(() => {
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

            return docker.build().catch(() => {
                failure = true;
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

    getApplications() {
        if (!this._applications) {
            const composition = this.getComposition().getSchema();
            const dockerBase = Util.getParentPath(this.getCompositionFile());

            const apps = [];

            Object.values(composition).forEach((app) => {
                const context = _.getValue(app, 'build.context');
                if (!_.isStringNotEmpty(context)) {
                    throw new Error(`Illegal context for app ${app.__code}`);
                }
                const file = `${dockerBase}/${app.build.context}/application.js`;

                if (!Util.testFile(file)) {
                    throw new Error(`Application file not found: ${file}`);
                }

                const Application = require(file);
                const application = new Application();

                application.setName(app.__code);

                apps.push(application);
            });

            this._applications = apps;
        }

        return this._applications;
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

            return this.closeStreams().then(() => {
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
            Util.makeFolder(path);

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
};

module.exports = MainClass;
module.exports.default = MainClass;
module.exports.Application = Application;
module.exports.WebpackTool = WebpackTool;