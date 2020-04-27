const utils = require('./utils');
const socket = require('./socket');
const db = require('@splinterlands/pg-querybuilder');
const hive = require('@splinterlands/hive-interface');

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
	hive.init(_options);

	if(_options.connection)
		db.init({ connection: _options.connection });
}

function stream(name, on_tx, ops) {
	socket.startClient(_options.ws_url, name, on_tx, ops);
}

async function processPurchase(purchase_id, payment) {
	return new Promise(async (resolve, reject) => {
		let purchase = await db.lookupSingle('purchases', { uid: purchase_id });

		if(!purchase)
			return reject({ error: `Purchase [${purchase_id}] not found.` });

		let amount = parseFloat(payment);
		let currency = utils.getCurrency(payment);

		if(currency != purchase.currency)
			return reject({ error: `Invalid currency sent. Expected ${purchase.currency} but got ${currency}.` });

		// Make sure the payment amount is enough!
		if(amount < parseFloat(purchase.ext_currency_amount))
			return reject({ error: `Payment was less than the required amount of: ${purchase.ext_currency_amount} ${currency}` });

		try {
			// Make the purchase
			hive.transfer(_options.account, _options.account, purchase.payment, purchase.uid, _options.active_key)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

async function sendDec(to, qty) {
	return new Promise((resolve, reject) => {
		if(!_options.account)
			return reject({ error: `Error: Property "account" missing from the "options" object.` });

		if(!_options.active_key)
			return reject({ error: `Error: Property "active_key" missing from the "options" object.` });

		let data = { to, qty, token: 'DEC' };

		try {
			hive.custom_json(`${_options.prefix}token_transfer`, data, _options.account, _options.active_key, true)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

async function sendPacks(to, qty, edition) {
	return new Promise((resolve, reject) => {
		if(!_options.account)
			return reject({ error: `Error: Property "account" missing from the "options" object.` });

		if(!_options.active_key)
			return reject({ error: `Error: Property "active_key" missing from the "options" object.` });

		let data = { to, qty, edition, token: 'DEC' };

		try {
			hive.custom_json(`${_options.prefix}gift_packs`, data, _options.account, _options.active_key, true)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

async function tournamentPayment(tournament_id, amount, currency) {
	let data = { tournament_id, payment: `${amount} ${currency}` };

	return new Promise((resolve, reject) => {
		try {
			hive.custom_json(`${_options.prefix}tournament_payment`, data, _options.game_account, _options.game_account_active_key, true)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

async function tournamentEntry(tournament_id, player, amount, currency) {
	let data = { tournament_id, player, payment: `${amount} ${currency}` };
	
	return new Promise((resolve, reject) => {
		try {
			hive.custom_json(`${_options.prefix}enter_tournament`, data, _options.game_account, _options.game_account_active_key, true)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

module.exports = { init, stream, sendDec, sendPacks, tournamentPayment, tournamentEntry, processPurchase };