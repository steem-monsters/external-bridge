const fs = require('fs');
const utils = require('./utils');

const DEFAULT_OPTIONS = Object.freeze({
    state_file_name: 'sl-state.json',
    blocks_behind_head: 0,
    types: [],
    is_validator: false,
});

/**
 * @typedef {{
 *     state_file_name: string,
 *     blocks_behind_head: number,
 *     game_api_url: string,
 *     types: string[] | ((type: string) => boolean),
 *     is_validator: boolean,
 * }} StreamOptions
 */

/**
 * @typedef {{
 *     state_file_name?: string,
 *     blocks_behind_head?: number,
 *     game_api_url: string,
 *     types?: string[],
 *     is_validator?: boolean,
 * }} InputStreamOptions
 */

/**
 * @typedef {(transaction: Transaction) => void} TransactionCallback
 */

/**
 * Loads the state from a JSON file
 * @param state_file_name {string} path to the file
 * @returns {undefined | number}
 */
function loadState(state_file_name) {
    if (fs.existsSync(state_file_name)) {
        const data = fs.readFileSync(state_file_name).toString();
        let state = JSON.parse(data);
        utils.log(`Restored saved state: ${data}`);

        const value = parseInt(state.last_block, 10);
        return isNaN(value) ? undefined : value;
    }
}

/**
 * Saves the state into a JSON file
 * @param last_block {number} block number to store
 * @param state_file_name {string} path to the file
 * @returns {void}
 */
function saveState(last_block, state_file_name) {
    fs.writeFile(state_file_name, JSON.stringify({last_block}), (err) => {
        if (err) utils.log(err, 1);
    });
}

class Stream {
    /**
     * @type {TransactionCallback}
     */
    #callback;
    /**
     * @type {StreamOptions}
     */
    #options;
    /**
     * @type {boolean}
     */
    #stopped;
    /**
     * @type {boolean}
     */
    #streaming;
    /**
     * @type {number | undefined}
     */
    #last_block;

    /**
     * @type {(string) => boolean}
     */
    #should_dispatch_type;

    /**
     *
     * @param callback {TransactionCallback}
     * @param options {InputStreamOptions}
     */
    constructor(callback, options) {
        this.#callback = callback;
        this.#options = {...DEFAULT_OPTIONS, ...options};
        this.#stopped = false;
        this.#streaming = false;
        this.#last_block = undefined;

        if (Array.isArray(this.#options.types)) {
            this.#should_dispatch_type = (type) => this.#options.types.includes(type);
        } else {
            this.#should_dispatch_type = this.#options.types;
        }
    }

    async loop() {
        this.#streaming = true;
        let delay = 0;
        this.#last_block = loadState(this.#options.state_file_name);

        while (!this.#stopped) {
            await utils.timeout(delay);

            const remote_head = await (this.#options.is_validator ? utils.getHeadBlockNumValidator(this.#options.game_api_url) : utils.getHeadBlockNum(this.#options.game_api_url)).catch(err => {
                utils.log(`Error loading last block: ${err}!`, 1, 'Red');
                delay = 1000;
                return null;
            });

            if (!remote_head) {
                continue;
            }

            const head_block = remote_head - this.#options.blocks_behind_head;

            if (!this.#last_block) {
                this.#last_block = head_block - 1;
            }

            if (head_block >= this.#last_block + 20) {
                utils.log(`Streaming is ${head_block - this.#last_block} blocks behind`, 1, 'Red');
            }

            while (head_block > this.#last_block && !this.#stopped) {
                try {
                    await this.processBlock(this.#last_block);
                    saveState(this.#last_block, this.#options.state_file_name);
                    this.#last_block++;
                } catch (err) {
                    utils.log(`Error loading block: ${this.#last_block}, Error: ${err}`, 1, 'Red');
                    break;
                }
            }

            delay = 1000;
        }

        this.#streaming = false;
    }

    /**
     *
     * @param block_num {number}
     * @returns {Promise<void>}
     */
    async processBlock(block_num) {
        utils.log(`Processing block [${block_num}]`, block_num % 1000 === 0 ? 1 : 4);
        let transactions = this.#options.is_validator ? await utils.getBlockValidator(this.#options.game_api_url, block_num) : await utils.getBlock(this.#options.game_api_url, block_num);

        utils.log(`Processing ${transactions.length} transactions...`, 4);

        if (!transactions) {
            return;
        }

        for (const transaction of transactions) {
            try {
                if (this.#should_dispatch_type(transaction.type)) {
                    this.#callback(transaction);
                }
            } catch (err) {
                utils.log(`Error processing transaction [${transaction.id}]: ${err}`, 1, 'Red');
            }
        }
    }

    getStatus() {
        return {streaming: this.#streaming, last_block: this.#last_block};
    }

    stop() {
        this.#stopped = true;
    }
}

module.exports = Stream;
