const Util = require('./util.js');

module.exports = class WebpackTool {

    constructor(context) {
        this._context = context;
    }

    async log(err, stats) {
        const ctx = this._context;

        await ctx.log("\n\n##################\n# WEBPACK OUTPUT #\n##################\n\n");
        if (err) {
            await ctx.log(err.toString(), true);
            throw err; // todo: this is terrible
        } else if (stats) {
            if (stats.hasErrors()) {
                await ctx.log(stats.toString('errors-only'), true);
            } else {
                await ctx.log(stats.toString('minimal'));

                if (ctx.getTask().analyzeBundle) {
                    await this.saveStats(stats);
                }
            }
        } else {
            await ctx.log('Webpack error', true);
            throw new Error('Webpack error'); // todo: this is terrible
        }
    }

    async saveStats(stats, folder = null) {
        const ctx = this._context;
        folder = folder || ctx.getTemporaryFolder('stats/');
        await Util.makeFolder(folder);

        await Util.writeFile(`${folder}/data`, JSON.stringify(stats.toJson({
            assets: true,
            hash: true,
        })));
    }
};
