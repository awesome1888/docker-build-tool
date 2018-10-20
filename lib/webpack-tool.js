const Util = require('./util.js');

module.exports = class WebpackTool {

    constructor(context) {
        this._context = context;
    }

    async log(err, stats) {
        const ctx = this._context;

        await ctx.log("\n\n##################\n# WEBPACK OUTPUT #\n##################\n\n");
        if (err || stats.hasErrors()) {
            await ctx.log(stats.toString('errors-only'), true);
            if (err) {
	            throw err;
            } else {
            	throw new Error(`Webpack error: ${stats.toString('errors-only')}`);
            }

        } else {
            await ctx.log(stats.toString('minimal'));

            if (ctx.getTask().analyzeBundle) {
                await this.saveStats(stats);
            }
        }
    }

    async saveStats(stats) {
        const ctx = this._context;
        const folder = ctx.getTemporaryFolder('stats/');
        await Util.makeFolder(folder);

        await Util.writeFile(`${folder}data`, JSON.stringify(stats.toJson({
            assets: true,
            hash: true,
        })));
    }
};
