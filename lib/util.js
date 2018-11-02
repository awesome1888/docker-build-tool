const spawn = require('child_process').spawn;
const fs = require('fs');
const _ = require('underscore-mixin');
const makeDir = require('make-dir');
const hash = require('object-hash');
const path = require('path');
const process = require('process');
const exec = require('child_process').exec;
const copydir = require('copy-dir');

module.exports = class Util {
    static execute(cmd, args = [], params = {}) {
        if (!_.isArray(args)) {
            args = [];
        }

        if (_.isFunction(params.logger)) {
            params.logger(`Executing: ${cmd} ${args.join(' ')}`);
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

	static testFolder(file) {
		return fs.existsSync(file);
	}

	static readFolder(file) {
		return fs.readdirSync(file);
    }

	// static isFolder(folder) {
	// 	if (!this.testFile(folder)) {
	// 		return false;
	// 	}
	//
	// 	return fs.lstatSync(folder).isDirectory();
	// }

    static makeFolder(folder) {
        if(makeDir.sync(folder)) {
            return folder;
        }

        return null;
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

        // ensure that folder exists
        const base = this.getParentPath(filePath);
        Util.makeFolder(base); // sync

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

    static async testCmd(cmd, output) {
        return new Promise((resolve) => {
            exec(cmd, (err, stdout) => {
                stdout = stdout.toString();
                resolve(stdout.indexOf(output) >= 0);
            });
        });
    }

    static makeLink(to, what) {
        const cwd = process.cwd();
        try {
            const rel = path.relative(to, what);
            process.chdir(to);
            const name = this.getBaseName(what);
            fs.symlinkSync(rel, `${to}/${name}`, 'dir');
        } catch(e) {
            process.chdir(cwd);
            if (e.code !== 'EEXIST') {
                throw e;
            } else {
                return;
            }
        }
        process.chdir(cwd);
    }

    static async copyDir(from, to) {
        return new Promise((resolve, reject) => {
            copydir(from, to, function(err){
                if(err){
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
};
