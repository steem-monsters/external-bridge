const request = require('request');
const logger = require('./logger');

function getCurrency(amount) {
	return amount.substr(amount.indexOf(' ') + 1);
}

function timeout(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryParse(json) {
	try {
		return JSON.parse(json);
	} catch (err) {
		logger.error(`Error trying to parse JSON: ${json}`, 3, 'Red');
		return null;
	}
}

module.exports = {
	timeout,
	tryParse,
	getCurrency,
};
