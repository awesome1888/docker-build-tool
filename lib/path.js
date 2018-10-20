const os = require('os');
const path = require('path');
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
	    let taskName = '';
        if (!task && ctx) {
            task = ctx.getTask();
            taskName = task.getName(ctx);
        }

        if (app) {
            folder = folder
                .replace('#APPLICATION_NAME#', app.getName());
        }

        if (task) {
            folder = folder
                .replace('#TASK_NAME#', taskName)
                .replace('#TASK_FOLDER#', task.getFolder() || '');
        }

        if (ctx) {
            folder = folder
                .replace('#MODE_NAME#', ctx.getMode());
        }

        if (app && task) {
            folder = folder
                .replace('#CONTEXT_ID#', `${app.getName()}/${taskName}`);
        }

        if (app && !folder.startsWith('/')) {
            folder = `${app.getRootFolder()}/${folder}`;
        }

        return folder;
    }

    static normalize(str) {
        return path.normalize(str);
    }
};
