const request = require("request");

let _options = { logging_level: 3 };

function set_options(options) {
	_options = Object.assign(_options, options);
}

async function getHeadBlockNum() {
	let resp = await getJson(`${_options.game_api_url}/last_block`, 'last block');
	if(resp && Number.isFinite(Number(resp.last_block)))
		return Number(resp.last_block);

	throw new Error(`last block returned an unexpected response: ${preview(resp)}`);
}

async function getBlock(block_num) {
	let resp = await getJson(`${_options.game_api_url}/transactions/by_block?block=${block_num}`, `block ${block_num}`);
	if(Array.isArray(resp))
		return resp;

	throw new Error(`block ${block_num} returned an unexpected response: ${preview(resp)}`);
}

function getJson(url, description) {
	return new Promise((resolve, reject) => {
		request.get({ url, timeout: _options.request_timeout_ms || 15000 }, (error, response, data) => {
			if(error)
				return reject(new Error(`${description} request failed: ${error.message || error}`));

			const statusCode = response && response.statusCode;
			if(!statusCode || statusCode < 200 || statusCode >= 300)
				return reject(new Error(`${description} returned HTTP ${statusCode || 'unknown'}: ${preview(data)}`));

			try {
				resolve(JSON.parse(data));
			} catch(err) {
				reject(new Error(`${description} returned invalid JSON: ${preview(data)}`));
			}
		});
	});
}

function preview(value) {
	let text;
	try {
		text = typeof value === 'string' ? value : JSON.stringify(value);
	} catch(err) {
		text = String(value);
	}

	return (text || '<empty>').replace(/\s+/g, ' ').slice(0, 500);
}

function getCurrency(amount) { return amount.substr(amount.indexOf(' ') + 1); }

// Logging levels: 1 = Error, 2 = Warning, 3 = Info, 4 = Debug
function log(msg, level, color) { 
  if(!level)
		level = 0;
		
	if(color && log_colors[color])
		msg = log_colors[color] + msg + log_colors.Reset;

  if(level <= _options.logging_level)
    console.log(new Date().toLocaleString() + ' - ' + msg); 
}

var log_colors = {
	Reset: "\x1b[0m",
	Bright: "\x1b[1m",
	Dim: "\x1b[2m",
	Underscore: "\x1b[4m",
	Blink: "\x1b[5m",
	Reverse: "\x1b[7m",
	Hidden: "\x1b[8m",

	Black: "\x1b[30m",
	Red: "\x1b[31m",
	Green: "\x1b[32m",
	Yellow: "\x1b[33m",
	Blue: "\x1b[34m",
	Magenta: "\x1b[35m",
	Cyan: "\x1b[36m",
	White: "\x1b[37m",

	BgBlack: "\x1b[40m",
	BgRed: "\x1b[41m",
	BgGreen: "\x1b[42m",
	BgYellow: "\x1b[43m",
	BgBlue: "\x1b[44m",
	BgMagenta: "\x1b[45m",
	BgCyan: "\x1b[46m",
	BgWhite: "\x1b[47m"
}

function timeout(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function tryParse(json) {
	try {
		return JSON.parse(json);
	} catch(err) {
		log('Error trying to parse JSON: ' + json, 3, 'Red');
		return null;
	}
}

module.exports = {
	set_options,
	log,
	timeout,
	tryParse,
	getCurrency,
	getHeadBlockNum,
	getBlock
}
