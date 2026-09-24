const fs = require('fs');
const utils = require('./utils');

let cb = null;
let _last_block = null;
let _is_streaming = false;
let _timer = null;
let _options = {
	state_file_name: 'sl-state.json',
	load_state: loadState,
	save_state: saveState,
	game_api_url: 'http://localhost:3000'
};

async function start(callback, options) {
	cb = callback;
	_options = Object.assign(_options, options);
	let last_block = await _options.load_state();
	utils.log(`Streamer starting from block: ${last_block || 'HEAD'}. Op Types: [${!options.types || options.types.length == 0 ? 'All' : options.types}]`);
	_is_streaming = true;
	await getNextBlock(last_block);
}

async function getNextBlock(last_block) {
	if(!_is_streaming)
		return;

	let cur_block_num = await utils.getHeadBlockNum().catch(err => {
		utils.log(`Error loading last block: ${err}!`, 1, 'Red');
		return null;
	});

	if(!cur_block_num) {
		scheduleNextBlock(last_block);
		return;
	}

	let head_block = cur_block_num - (_options.blocks_behind_head || 0);

	if(!last_block || isNaN(last_block))
		last_block = head_block - 1;

	// We are 20+ blocks behind!
	if(head_block >= last_block + 20)
		utils.log('Streaming is ' + (head_block - last_block) + ' blocks behind!', 1, 'Red');

	// If we have a new block, process it
	while(head_block > last_block) {
		try {
			await processBlock(last_block);
			last_block++;
			await _options.save_state(last_block);
			_last_block = last_block;
		} catch (err) {
			utils.log(`Error loading block: ${last_block}, Error: ${err}!`, 1, 'Red');
			break;
		}
	}

	// Attempt to load the next block after a 1 second delay (or faster if we're behind and need to catch up)
	scheduleNextBlock(last_block);
}

function scheduleNextBlock(last_block) {
	if(_is_streaming)
		_timer = setTimeout(() => getNextBlock(last_block), _options.poll_interval_ms || 1000);
}

async function processBlock(block_num) {
	utils.log(`Processing block [${block_num}]`, block_num % 1000 == 0 ? 1 : 4);
	let transactions = await utils.getBlock(block_num);

	if(!transactions)
		return;

	utils.log(`Processing ${transactions.length} transactions...`, 4);

	for(let i = 0; i < transactions.length; i++) {
		if(cb && (!_options.types || _options.types.length == 0 || _options.types.includes(transactions[i].type))) {
			try {
				await cb(transactions[i]);
			} catch(err) {
				const transactionId = transactions[i].trx_id || transactions[i].transaction_id || transactions[i].id || 'unknown';
				utils.log(`Error processing transaction [${transactionId}]: ${err}`, 1, 'Red');
				throw err;
			}
		}
	}
}

async function loadState() {
	// Check if state has been saved to disk, in which case load it
	if (fs.existsSync(_options.state_file_name)) {
		let state = JSON.parse(fs.readFileSync(_options.state_file_name));
    utils.log('Restored saved state: ' + JSON.stringify(state));
    return state.last_block;
	}
}

async function saveState(last_block) {
	_last_block = last_block;
	const tempFileName = `${_options.state_file_name}.tmp`;

	// Persist the next block to process atomically so a restart cannot observe
	// a partial checkpoint.
	await fs.promises.writeFile(tempFileName, JSON.stringify({ last_block }));
	await fs.promises.rename(tempFileName, _options.state_file_name);
}

function getStatus() { return { streaming: _is_streaming, last_block: _last_block }; }

function stop() {
	_is_streaming = false;
	if(_timer) {
		clearTimeout(_timer);
		_timer = null;
	}
}

module.exports = { start, stop, getStatus };
