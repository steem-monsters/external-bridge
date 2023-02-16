/**
 * @typedef {{
 *     rpc_error_limit: number,
 *     rpc_nodes: string[],
 *     ws_url: string,
 *     state_file_name: string,
 *     games: {
 *      api_url: string,
 *      name: string,
 *      types: ((type: string) => boolean) | string[],
 *      cb: TransactionCallback,
 *      state_file_name?: string,
 *      is_validator: boolean,
 *     }[],
 *     api: {
 *         port: number,
 *         external_status?: () => Promise<any>
 *     } | undefined,
 * }} ExternalBridgeOptions
 */
const utils = require("./utils");
const Stream = require("./stream");

const DEFAULT_OPTIONS = Object.freeze({
    rpc_error_limit: 20,
    rpc_nodes: ["https://api.hive.blog", "https://anyx.io", "https://hived.splinterlands.com"],
    ws_url: "http://localhost:1234",
    state_file_name: "sl-state.json",
    games: [],
    prefix: "dev-sm_",
});

class ExternalBridge {
    /**
     * @type {Map<string, Stream>}
     */
    #streams;
    /**
     * @type {ExternalBridgeOptions}
     */
    #options;
    /**
     * @type {Promise<any>[]}
     */
    #handles;

    /**
     * @param options {Partial<ExternalBridgeOptions>}
     */
    constructor(options) {
        this.#options = {...DEFAULT_OPTIONS, ...options};

        if (this.#options.api) {
            const app = require('express')();

            app.use(function (req, res, next) {
                res.header("Access-Control-Allow-Origin", "*");
                res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, X-CSRF-Token, Content-Type, Accept");
                res.header("X-Frame-Options", "sameorigin")
                next();
            });

            app.listen(this.#options.api.port, () => utils.log(`Bridge status API running on port: ${this.#options.api.port}`));
            app.get('/status', (req, res, _next) => this.getStatus(req, res));
        }

        this.#streams = new Map();

        for (const game of this.#options.games) {
            if (this.#streams.has(game.name)) {
                throw new Error(`Duplicate game name ${game.name}`);
            }

            if (game.name === "external") {
                throw new Error(`Illegal game name ${game.name}`);
            }

            const s = new Stream(game.cb, {
                types: game.types,
                state_file_name: game.state_file_name ?? `${game.name}.json`,
                game_api_url: game.api_url,
                is_validator: game.is_validator,
            })
            this.#streams.set(game.name, s);
        }

        this.#handles = [];
    }

    stream() {
        if (this.#handles.length > 0) {
            // Already streaming
            return;
        }

        for (const [name, s] of this.#streams.entries()) {
            utils.log(`Starting stream for ${name}`, 1);
            const handle = s.loop().then(() => {
                utils.log(`Stream ${name} has stopped`, 1);
            }, (err) => {
                utils.log(`Stream ${name} encountered an error and has stopped. ${err}`, 1, 'Red');
            });
            this.#handles.push(handle);
        }
    }

    async stop() {
        for (const [name, s] of this.#streams.entries()) {
            utils.log(`Stopping stream ${name}`);
            s.stop();
        }

        await Promise.all(this.#handles);
    }

    /**
     *
     * @param req {import('express').Request}
     * @param res {import('express').Response}
     * @returns {Promise<void>}
     */
    async getStatus(req, res) {
        let status = {};

        for (const [name, s] of this.#streams.entries()) {
            status[name] = s.getStatus();
        }

        status.external = await this.#options.api?.external_status?.();

        res.json(status);
    }
}

module.exports = ExternalBridge;
