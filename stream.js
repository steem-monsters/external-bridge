const fs = require('fs');
const utils = require('./utils');

let cb = null;
let _last_block = null;
let _is_streaming = false;
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
	getNextBlock(last_block);
}

async function getNextBlock(last_block) {
	let cur_block_num = await utils.getHeadBlockNum().catch(err => {
		utils.log(`Error loading last block: ${err}!`, 1, 'Red');
		return null;
	});

	if(!cur_block_num) {
		setTimeout(() => getNextBlock(last_block), 1000);
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
			_options.save_state(last_block);
			last_block++;
		} catch (err) {
			utils.log(`Error loading block: ${last_block}, Error: ${err}!`, 1, 'Red');
			break;
		}
	}

	// Attempt to load the next block after a 1 second delay (or faster if we're behind and need to catch up)
	setTimeout(() => getNextBlock(last_block), 1000);
}

async function processBlock(block_num) {
	utils.log(`Processing block [${block_num}]`, block_num % 1000 == 0 ? 1 : 4);
	let transactions = await utils.getBlock(block_num);

	utils.log(`Processing ${transactions.length} transactions...`, 4);

	if(!transactions)
		return;

	for(let i = 0; i < transactions.length; i++) {
		try {
			if(cb) {
				if(!_options.types || _options.types.length == 0 || _options.types.includes(transactions[i].type))
					cb(transactions[i]);
			}
		} catch(err) { utils.log(`Error processing transaction [${block.transaction_ids[i]}]: ${err}`, 1, 'Red'); }
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

function saveState(last_block) {
	_last_block = last_block;

  // Save the last block read to disk
  fs.writeFile(_options.state_file_name, JSON.stringify({ last_block }), function (err) {
    if (err)
      utils.log(err);
  });
}

function getStatus() { return { streaming: _is_streaming, last_block: _last_block }; }

module.exports = { start, getStatus };
