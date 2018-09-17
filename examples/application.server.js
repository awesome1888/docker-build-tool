const path = require('path');
const ExternalsPlugin = require('webpack2-externals-plugin');
const HardSourceWebpackPlugin = require('hard-source-webpack-plugin');
const webpack = require('webpack');

const Application = require('docker-webpack').Application;
const WebpackTool = require('docker-webpack').WebpackTool;

module.exports = class ApplicationServer extends Application {

    getRootFolder() {
        return __dirname;
    }

    getTasks() {
        const rootFolder = this.getRootFolder();
        return [
            {
                files: [`${rootFolder}/src/**/*`],
                action: this.buildServer.bind(this),
            },
        ];
    }

    async buildServer(context) {
        const srcFolder = context.getSrcFolder();
        const dstFolder = await context.provideDstFolder();

        return new Promise((resolve, reject) => {
            webpack({
                // in the production mode webpack will minify everything
                mode: context.getMode(),

                // inform webpack we are building for nodejs, not browsers
                target: 'node',

                // we specify the root file to allow webpack to
                // calculate the dependency tree and strip away unused stuff
                entry: `${srcFolder}/index.js`,

                // where to put the output bundle
                output: {
                    filename: 'index.js',
                    path: dstFolder,
                    libraryTarget: 'commonjs2',
                },

                resolve: {
                    // disable "symlink resolution", in order to make it work as expected
                    symlinks: false,
                },

                plugins: [
                    // the plugin tells webpack not to bundle-up node_modules, but in practise it sometimes
                    // breaks everything :(
                    new ExternalsPlugin({
                        type: 'commonjs',
                        include: path.join(this.getRootFolder(), 'node_modules'),
                    }),
                    // a cache, for incremental builds
                    new HardSourceWebpackPlugin({
                        cacheDirectory: `${context.getHardSourcePluginFolder()}`,
                        cachePrune: {
                            // wipe out cache older than 1 day
                            maxAge: 24 * 60 * 60 * 1000,
                            // wipe out cache higher than 50mb
                            sizeThreshold: 50 * 1024 * 1024
                        },
                        info: {
                            // 'debug', 'log', 'info', 'warn', or 'error'.
                            level: 'info',
                        },
                    }),
                    new webpack.ProvidePlugin({
                        _: 'underscore-mixin',
                        mix: `${srcFolder}/common/lib/util/global/mix.js`,
                        ObjectId: `${srcFolder}/common/lib/util/global/object-id.js`,
                        TObjectId: `${srcFolder}/common/lib/util/global/t-object-id.js`,
                        Schema: `${srcFolder}/common/lib/util/global/schema.js`,
                    }),
                ],
            }, (err, stats) => {
                const tool = new WebpackTool(context);

                tool.log(err, stats).then(() => {
                    resolve();
                }).catch(() => {
                    reject();
                });
            });
        });
    }
};
