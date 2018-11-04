const Util = require('./util.js');

module.exports = class Docker {

    constructor(context) {
        this._context = context;
    }

    async build() {
        const context = this._context;
        const image = context.getDockerImageName();
        const app = context.getApplication();

        const project = app.getProject();
        return Util.execute('docker', ['build', '-t', image, '-f', context.getDockerfilePath(), app.getBuildRootFolder()], {
            stdoutTo: context.getStdoutTo(),
            stderrTo: context.getStderrTo(),
            logger: project.getParams().exposeCLI ? project.log : null,
        });
    }

    async push() {
        const context = this._context;
        const image = context.getDockerImageName();
        if (!_.isStringNotEmpty(image)) {
            return '';
        }

        const project = context.getApplication().getProject();
        return Util.execute('docker', ['push', image], {
            stdoutTo: context.getStdoutTo(),
            stderrTo: context.getStderrTo(),
            logger: project.getParams().exposeCLI ? project.log : null,
        });
    }
};
