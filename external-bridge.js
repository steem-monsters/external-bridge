const utils = require('./utils');
const streamer = require('./stream');
const db = require('@splinterlands/pg-querybuilder');
const interface = require('@splinterlands/hive-interface');

let hive = null;

let _options = {
	logging_level: 3,
	rpc_error_limit: 20,
	rpc_nodes: ["https://api.hive.blog", "https://anyx.io", "https://hived.splinterlands.com"],
	ws_url: "http://localhost:1234",
	state_file_name: 'sl-state.json',
	game_api_url: 'http://localhost:3000',
	prefix: "dev-sm_"
};

function init(options) {
	_options = Object.assign(_options, options);
	utils.set_options(_options);
	hive = new interface.Hive(_options);

	if(_options.connection)
		db.init({ connection: _options.connection });

	// Set up the API if enabled
	if(_options.api) {
		const app = require('express')();

		app.use(function(req, res, next) {
			res.header("Access-Control-Allow-Origin", "*");
			res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, X-CSRF-Token, Content-Type, Accept");
			res.header("X-Frame-Options", "sameorigin")			
			next();
		});

		app.listen(_options.api.port, () => utils.log(`Bridge status API running on port: ${_options.api.port}`));
		app.get('/status', getStatus);
	}
}

async function getStatus(req, res) {
	let status = { splinterlands: streamer.getStatus() };

	if(_options.api.get_status)
		status.external = await _options.api.get_status();

	res.json(status);
}

function stream(on_tx, types) {
	_options.types = types;
	streamer.start(on_tx, _options);
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
		if(amount * 1.02 < parseFloat(purchase.ext_currency_amount))
			return reject({ error: `Payment was less than the required amount of: ${purchase.ext_currency_amount} ${currency}` });

		// The "steemmonsters" account can send any amount of HIVE to complete a purchase, but we limit it to 10k HIVE because it might not have enough in the acct otherwise
		if(parseFloat(purchase.payment) > 10000)
			purchase.payment = '10000.000 HIVE';

		try {
			// Make the purchase
			hive.transfer(_options.account, _options.account, purchase.payment, purchase.uid, _options.active_key)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

async function sendDec(to, qty, account, active_key) {
	return await sendToken(to, 'DEC', qty, account, active_key);
}

async function sendToken(to, token, qty, account = _options.account, active_key = _options.active_key) {
	return new Promise((resolve, reject) => {
		if(!account)
			return reject({ error: `Error: Property "account" missing from the "options" object.` });

		if(!active_key)
			return reject({ error: `Error: Property "active_key" missing from the "options" object.` });

		let data = { to, qty, token };

		try {
			hive.custom_json(`${_options.prefix}token_transfer`, data, account, active_key, true)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

async function sendPacks(to, qty, edition, account = _options.account, active_key = _options.active_key) {
	return new Promise((resolve, reject) => {
		if(!_options.account)
			return reject({ error: `Error: Property "account" missing from the "options" object.` });

		if(!_options.active_key)
			return reject({ error: `Error: Property "active_key" missing from the "options" object.` });

		let data = { to, qty, edition, token: 'DEC' };

		try {
			hive.custom_json(`${_options.prefix}gift_packs`, data, account, active_key, true)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

async function tournamentPayment(tournament_id, amount, currency, account = _options.escrow_account, active_key = _options.escrow_active_key) {
	let data = { tournament_id, payment: `${amount} ${currency}` };

	return new Promise((resolve, reject) => {
		try {
			hive.custom_json(`${_options.prefix}tournament_payment`, data, account, active_key, true)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

async function tournamentEntry(tournament_id, player, amount, currency, signed_pw, captcha_token, account = _options.escrow_account, active_key = _options.escrow_active_key) {
	let data = { 
		tournament_id,
		player,
		payment: `${amount} ${currency}`
	};
	
	if(signed_pw)
		data.signed_pw = signed_pw;

	if(captcha_token)
		data.captcha_token = captcha_token;
	
	return new Promise((resolve, reject) => {
		try {
			hive.custom_json(`${_options.prefix}enter_tournament`, data, account, active_key, true)
				.then(resolve)
				.catch(reject);
		} catch (err) { reject(err); }
	});
}

async function lookupTransaction(id, chain, client) {
	if(chain)
		chain = chain.toLowerCase();

	return await db.lookupSingle('website.external_transactions', { id, chain }, client);
}

const CONCLAVE_PACK_TYPES = [
	{
		pack_type: 'standard',
		symbol: 'ARCANA',
	},
	{
		pack_type: 'legendary',
		symbol: 'ARCANAL',
	},
	{
		pack_type: 'alchemist',
		symbol: 'ARCANAA',
	},
	{
		pack_type: 'starter',
		symbol: 'ARCANAS',
	},
];

async function logGameTransaction(tx, ext_chain) {
	const data = utils.tryParse(tx.data);

	if(!data) {
		utils.log(`Cannot parse data for tx ${tx.id}`, 1, 'Red');
		return;
	}

	if(!data.token && data.edition != undefined) {
		const symbol = ['ALPHA', 'BETA', 'ORB', null, 'UNTAMED', 'DICE', 'GLADIUS', 'CHAOS', 'RIFT', 'NIGHTMARE', null, null, 'REBELLION', null, CONCLAVE_PACK_TYPES][data.edition];
		if (Array.isArray(symbol)) {
			const foundToken = symbol.find(e => e.pack_type === data.type);
			data.token = foundToken ? foundToken.symbol : null;
		} else {
			data.token = symbol;
		}
	} else if (data.cards) {
		data.token = 'CARD';
		data.qty = data.cards.length;
	}

	// Record the transaction in the database
	return logTransaction(
		tx.id,
		'splinterlands',
		tx.block_num,
		tx.type,
		data.token,
		data.qty,
		tx.player,
		data.to,
		data,
		null,
		false,
		ext_chain,
		null);
}

async function logRefundTx(tx_id, chain, refund_tx) {
	return db.updateSingle('website.external_transactions', { refund_tx }, { id: tx_id, chain });
}

async function logTransaction(id, chain, block_num, type, token, amount, from, to, data, result, success, bridge_chain, bridge_tx) {
	return await db.insert('website.external_transactions', {
		chain: chain ? chain.toLowerCase() : chain,
		id,
		block_num,
		created_date: new Date(),
		type,
		token,
		amount,
		from_address: from,
		to_address: to,
		data: data && typeof data == 'object' ? JSON.stringify(data) : data,
		success,
		result: result && typeof result == 'object' ? JSON.stringify(result) : result,
		bridge_chain,
		bridge_tx
	});
}

async function updateExternalTx(tx_id, chain, success, result, bridge_tx) {
	return db.updateSingle('website.external_transactions', { 
		success, 
		result: result && typeof result == 'object' ? JSON.stringify(result) : result,
		bridge_tx
	}, { id: tx_id, chain });
}

async function logExternalTxError(tx_id, chain, err) {
	return db.updateSingle('website.external_transactions', { result: `Error: ${err && err.message ? err.message : err}` }, { id: tx_id, chain });
}

async function customJson(id, json, account, key, use_active) {
	return hive.custom_json(id, json, account, key, use_active);
}

module.exports = {
	init, 
	stream, 
	sendDec, 
	sendToken, 
	sendPacks, 
	tournamentPayment, 
	tournamentEntry, 
	processPurchase, 
	lookupTransaction, 
	logTransaction, 
	logGameTransaction, 
	logRefundTx, 
	updateExternalTx, 
	logExternalTxError, 
	customJson
};