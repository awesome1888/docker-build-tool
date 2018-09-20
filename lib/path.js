const os = require('os');
const _ = require('underscore-mixin');

module.exports = class Path {
    static getSystemTemporaryFolder() {
        return os.tmpdir();
    }

    static getToolTemporaryFolder() {
        return `${this.getSystemTemporaryFolder()}/build-tool/`;
    }

    static fillTemplate(folder, refs = {}) {
        if (!_.isStringNotEmpty(folder)) {
            return '';
        }

        const ctx = refs.context || null;
        let app = refs.application || null;
        if (!app && ctx) {
            app = ctx.getApplication();
        }
        let task = refs.task || null;
        if (!task && ctx) {
            task = ctx.getTask();
        }

        if (app) {
            folder = folder
                .replace('#APPLICATION_NAME#', app.getName());
        }

        if (task) {
            folder = folder
                .replace('#TASK_NAME#', task.getName())
                .replace('#TASK_FOLDER#', task.getFolder() || '');
        }

        if (ctx) {
            folder = folder
                .replace('#MODE_NAME#', ctx.getMode());
        }

        if (app && task) {
            folder = folder
                .replace('#CONTEXT_ID#', `${app.getName()}/${task.getName()}`);
        }

        if (app && !folder.startsWith('/')) {
            folder = `${app.getRootFolder()}/${folder}`;
        }

        return folder;
    }
};
