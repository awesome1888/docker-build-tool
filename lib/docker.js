const Util = require('./util.js');

module.exports = class Docker {

    constructor(context) {
        this._context = context;
    }

    async build() {
        const context = this._context;
        const image = context.getDockerImageName();
        const app = context.getApplication();

        return Util.execute('docker', ['build', '-t', image, '-f', context.getDockerfilePath(), app.getRootFolder()], {
            stdoutTo: context.getStdoutTo(),
            stderrTo: context.getStderrTo(),
        });
    }

    async push() {
        const context = this._context;
        const image = context.getDockerImageName();
        if (!_.isStringNotEmpty(image)) {
            return '';
        }

        return Util.execute('docker', ['push', image], {
            stdoutTo: context.getStdoutTo(),
            stderrTo: context.getStderrTo(),
        });
    }
};
