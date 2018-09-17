const path = require('path');
const ExternalsPlugin = require('webpack2-externals-plugin');
const HardSourceWebpackPlugin = require('hard-source-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');

const Application = require('docker-webpack').Application;
const WebpackTool = require('docker-webpack').WebpackTool;

module.exports = class ApplicationClientServer extends Application {

    getRootFolder() {
        return __dirname;
    }

    getTasks() {
        const rootFolder = this.getRootFolder();
        return [
            {
                files: [`${rootFolder}/client/src/**/*`],
                folder: `${rootFolder}/client/`,
                analyzeBundle: true,
                action: this.buildClient.bind(this),
            },
            {
                files: [`${rootFolder}/server/src/**/*`],
                folder: `${rootFolder}/server/`,
                action: this.buildServer.bind(this),
            },
        ];
    }

    async buildClient(context) {
        const srcFolder = context.getSrcFolder();
        const dstFolder = await context.provideDstFolder();

        return new Promise((resolve, reject) => {
            webpack({
                // in the production mode webpack will minify everything
                mode: context.getMode(),

                // we specify the root file to allow webpack to
                // calculate the dependency tree and strip away unused stuff
                entry: `${srcFolder}/index.js`,

                // where to put the output bundle
                output: {
                    filename: '[name].js',
                    path: dstFolder,
                    publicPath: 'public/',
                },

                resolve: {
                    extensions: ['.js', '.jsx'],
                    // disable "symlink resolution", in order to make it work as expected
                    symlinks: false,
                },

                module: {
                    rules: [
                        {
                            test: /\.jsx?$/,
                            exclude: /node_modules(\/|\\)(?!(@feathersjs))/,
                            use: [
                                {
                                    loader: 'babel-loader',
                                    options: {
                                        plugins: [
                                            'transform-class-properties'
                                        ],
                                        presets: [
                                            'es2015',
                                            'react', // translate jsx
                                            'stage-0', // async code
                                            'stage-2', // spread operator
                                            ['env', {
                                                targets: {
                                                    browsers: ['last 2 versions'],
                                                }
                                            }]
                                        ]
                                    }
                                }
                            ]
                        },
                        {
                            test: /\.(sa|sc|c)ss$/,
                            exclude: /node_modules/,
                            use: [
                                'style-loader',
                                MiniCssExtractPlugin.loader,
                                {
                                    loader: 'css-loader',
                                    options: {
                                        sourceMap: true
                                    }
                                },
                                {
                                    loader: 'sass-loader',
                                    options: {
                                        sourceMap: true
                                    }
                                }
                            ],
                        },
                        {
                            test: /\.less$/,
                            exclude: /node_modules/,
                            use: [
                                'style-loader',
                                MiniCssExtractPlugin.loader,
                                {
                                    loader: 'css-loader',
                                    options: {
                                        sourceMap: true
                                    }
                                },
                                {
                                    loader: 'less-loader',
                                    options: {
                                        sourceMap: true
                                    }
                                }
                            ],
                        },
                        {
                            test: /\.(jpe?g|gif|png|svg|ico)$/i,
                            use: [
                                {
                                    loader: 'url-loader',
                                    options: {
                                        limit: 10000,
                                    },
                                },
                            ],
                        },
                    ]
                },

                // https://webpack.js.org/configuration/devtool/
                devtool: 'source-map',
                plugins: [
                    // remove unused momentjs locales
                    new webpack.ContextReplacementPlugin(
                        /moment[\/\\]locale$/,
                        /en/
                    ),
                    // a cache, for incremental builds
                    new HardSourceWebpackPlugin({
                        cacheDirectory: `${context.getHardSourcePluginFolder()}`,
                        cachePrune: {
                            // wipe out cache older than 1 minute
                            maxAge: 60 * 1000,
                            // wipe out cache higher than 50mb
                            sizeThreshold: 50 * 1024 * 1024
                        },
                        info: {
                            // 'debug', 'log', 'info', 'warn', or 'error'.
                            level: 'info',
                        },
                    }),
                    new MiniCssExtractPlugin({
                        filename: 'style.css',
                    }),
                    new HtmlWebpackPlugin({
                        inject: false,
                        hash: true,
                        template: `${srcFolder}/assets.html`,
                        filename: 'assets.html'
                    }),
                    new webpack.ProvidePlugin({
                        _: 'underscore-mixin',
                        $: 'jquery',
                        mix: `${srcFolder}/common/lib/util/global/mix.js`,
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
                        include: path.join(`${this.getRootFolder()}/server/`, 'node_modules'),
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
