const streamer = require('@steem-monsters/splinterlands-tx-streamer');
const db = require('@splinterlands/pg-querybuilder');
const hiveInterface = require('@splinterlands/hive-interface');
const logger = require('./logger');
const utils = require('./utils');

let hive = null;

let _options = {
	logging_level: 3,
	rpc_error_limit: 20,
	rpc_nodes: ['https://api.hive.blog', 'https://anyx.io', 'https://hived.splinterlands.com'],
	ws_url: 'http://localhost:1234',
	state_file_name: 'sl-state.json',
	game_api_url: 'http://localhost:3000',
	prefix: 'dev-sm_',
};

function init(options) {
	_options = Object.assign(_options, options);
	hive = new hiveInterface.Hive(_options);

	if (_options.connection) {
		db.init({ connection: _options.connection });
	}

	// Set up the API if enabled
	if (_options.api) {
		const app = require('express')();

		app.use((req, res, next) => {
			res.header('Access-Control-Allow-Origin', '*');
			res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, X-CSRF-Token, Content-Type, Accept');
			res.header('X-Frame-Options', 'sameorigin');
			next();
		});

		app.listen(_options.api.port, () => logger.info(`Bridge status API running on port: ${_options.api.port}`));
		app.get('/status', getStatus);
	}
}

async function getStatus(req, res) {
	const status = { splinterlands: streamer.getStatus() };

	if (_options.api.get_status) {
		status.external = await _options.api.get_status();
	}

	res.json(status);
}

function stream(on_tx, types) {
	_options.types = types;
	_options.logger = logger;
	streamer.start(on_tx, _options);
}

async function processPurchase(purchase_id, payment) {
	return new Promise(async (resolve, reject) => {
		const purchase = await db.lookupSingle('purchases', { uid: purchase_id });

		if (!purchase) {
			return reject({ error: `Purchase [${purchase_id}] not found.` });
		}

		const amount = parseFloat(payment);
		const currency = utils.getCurrency(payment);

		if (currency !== purchase.currency) {
			return reject({ error: `Invalid currency sent. Expected ${purchase.currency} but got ${currency}.` });
		}

		// Make sure the payment amount is enough!
		if (amount * 1.02 < parseFloat(purchase.ext_currency_amount)) {
			return reject({ error: `Payment was less than the required amount of: ${purchase.ext_currency_amount} ${currency}` });
		}

		try {
			// Make the purchase
			hive.transfer(_options.account, _options.account, purchase.payment, purchase.uid, _options.active_key).then(resolve).catch(reject);
		} catch (err) {
			reject(err);
		}
	});
}

async function sendDec(to, qty, account, active_key) {
	return sendToken(to, 'DEC', qty, account, active_key);
}

async function sendToken(to, token, qty, account = _options.account, active_key = _options.active_key) {
	return new Promise((resolve, reject) => {
		if (!_options.account) {
			return reject({ error: `Error: Property "account" missing from the "options" object.` });
		}

		if (!_options.active_key) {
			return reject({ error: `Error: Property "active_key" missing from the "options" object.` });
		}

		const data = { to, qty, token };

		try {
			hive.custom_json(`${_options.prefix}token_transfer`, data, account, active_key, true).then(resolve).catch(reject);
		} catch (err) {
			reject(err);
		}
	});
}

async function sendPacks(to, qty, edition, account = _options.account, active_key = _options.active_key) {
	return new Promise((resolve, reject) => {
		if (!_options.account) {
			return reject({ error: `Error: Property "account" missing from the "options" object.` });
		}

		if (!_options.active_key) {
			return reject({ error: `Error: Property "active_key" missing from the "options" object.` });
		}

		const data = { to, qty, edition, token: 'DEC' };

		try {
			hive.custom_json(`${_options.prefix}gift_packs`, data, account, active_key, true).then(resolve).catch(reject);
		} catch (err) {
			reject(err);
		}
	});
}

async function tournamentPayment(tournament_id, amount, currency, account = _options.game_account, active_key = _options.game_account_active_key) {
	const data = { tournament_id, payment: `${amount} ${currency}` };

	return new Promise((resolve, reject) => {
		try {
			hive.custom_json(`${_options.prefix}tournament_payment`, data, account, active_key, true).then(resolve).catch(reject);
		} catch (err) {
			reject(err);
		}
	});
}

async function tournamentEntry(tournament_id, player, amount, currency, signed_pw, captcha_token, account = _options.game_account, active_key = _options.game_account_active_key) {
	const data = {
		tournament_id,
		player,
		payment: `${amount} ${currency}`,
	};

	if (signed_pw) {
		data.signed_pw = signed_pw;
	}

	if (captcha_token) {
		data.captcha_token = captcha_token;
	}

	return new Promise((resolve, reject) => {
		try {
			hive.custom_json(`${_options.prefix}enter_tournament`, data, account, active_key, true).then(resolve).catch(reject);
		} catch (err) {
			reject(err);
		}
	});
}

async function lookupTransaction(id, chain, client) {
	if (chain) {
		// eslint-disable-next-line no-param-reassign
		chain = chain.toLowerCase();
	}

	return db.lookupSingle('website.external_transactions', { id, chain }, client);
}

async function logTransaction(id, chain, block_num, type, token, amount, from, to, data, result, success, bridge_chain, bridge_tx) {
	return db.insert('website.external_transactions', {
		chain: chain ? chain.toLowerCase() : chain,
		id,
		block_num,
		created_date: new Date(),
		type,
		token,
		amount,
		from_address: from,
		to_address: to,
		data: data && typeof data === 'object' ? JSON.stringify(data) : data,
		success,
		result: result && typeof result === 'object' ? JSON.stringify(result) : result,
		bridge_chain,
		bridge_tx,
	});
}

module.exports = { init, stream, sendDec, sendToken, sendPacks, tournamentPayment, tournamentEntry, processPurchase, lookupTransaction, logTransaction };
