const spawn = require('child_process').spawn;
const fs = require('fs');
const _ = require('underscore-mixin');
const makeDir = require('make-dir');
const hash = require('object-hash');
const path = require('path');

module.exports = class Util {
    static execute(cmd, args = [], params = {}) {
        if (!_.isArray(args)) {
            args = [];
        }

        const stdoutTo = params.stdoutTo || null;
        const stderrTo = params.stderrTo || null;

        return new Promise((resolve, reject) => {
            const handle = spawn(cmd, args);

            if (stdoutTo) {
                handle.stdout.on('data', (data) => {
                    stdoutTo.write(data.toString());
                });
            }
            if (stderrTo) {
                handle.stderr.on('data', (data) => {
                    stderrTo.write(data.toString());
                });
            }

            handle.on('close', (code) => {
                if (code > 0) {
                    reject(code);
                } else {
                    resolve(code);
                }
            });
        });
    }

    static testFile(file) {
        return fs.existsSync(file);
    }

    static makeFolder(folder) {
        return makeDir(folder);
    }

    static hash(data) {
        if (_.isObjectNotEmpty(data)) {
            const obj = _.pick(data, (value) => {
                return !_.isFunction(value);
            });

            return hash(obj);
        }

        return '';
    }

    static makeStream(filePath) {
        const stream = fs.createWriteStream(filePath, {
            flags: 'w',
        });
        stream.on('error', (e) => {
            // say no to unhandled exceptions :)
        });
        // stream.on('finish', () => {
        // });

        return stream;
    }

    static getBaseName(folder) {
        const struct = path.parse(path.normalize(folder));

        if (_.isObjectNotEmpty(struct) && _.isStringNotEmpty(struct.base)) {
            return struct.base;
        }

        return '';
    }

    static getParentName(folder) {
        return this.getBaseName(this.getParentPath(folder));
    }

    static getParentPath(folder) {
        const struct = path.parse(path.normalize(folder));

        if (_.isObjectNotEmpty(struct) && _.isStringNotEmpty(struct.dir)) {
            return struct.dir;
        }

        return '';
    }

    static async writeFile(file, data) {
        fs.writeFileSync(file, data);
    }
};