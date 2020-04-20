const utils = require('./utils');
const socket = require('./socket');
const steem = require('steem-interface');

let _options = {
	logging_level: 3,
	rpc_error_limit: 20,
	rpc_nodes: ["https://api.steemit.com", "https://seed.steemmonsters.com", "https://steemd.minnowsupportproject.org"],
	ws_url: "http://localhost:1234",
	prefix: "dev-sm_"
};

function init(options) {
	_options = Object.assign(_options, options);
	utils.set_options(_options);
	steem.init(_options);
}

function stream(name, on_tx, ops) {
	socket.startClient(_options.ws_url, name, on_tx, ops);
}

async function sendDec(to, qty) {
	if(!_options.account) {
		utils.log(`Error: Property "account" missing from the "options" object.`, 1, 'Red');
		return;
	}

	if(!_options.active_key) {
		utils.log(`Error: Property "active_key" missing from the "options" object.`, 1, 'Red');
		return;
	}

	let data = { to, qty, token: 'DEC' };
	return new Promise((resolve, reject) => {
		try {
			steem.custom_json(`${_options.prefix}token_transfer`, data, _options.account, _options.active_key, true)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

async function sendPacks(to, qty, edition) {
	if(!_options.account) {
		utils.log(`Error: Property "account" missing from the "options" object.`, 1, 'Red');
		return;
	}

	if(!_options.active_key) {
		utils.log(`Error: Property "active_key" missing from the "options" object.`, 1, 'Red');
		return;
	}

	let data = { to, qty, edition, token: 'DEC' };
	return new Promise((resolve, reject) => {
		try {
			steem.custom_json(`${_options.prefix}gift_packs`, data, _options.account, _options.active_key, true)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

module.exports = { init, stream, sendDec, sendPacks };