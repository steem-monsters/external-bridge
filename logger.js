require('dotenv').config();
const { format, createLogger, transports } = require('winston');

const { combine, printf } = format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
	return `${timestamp} ${level}: ${stack || message} `;
});

// const levels = { 0: 'error', 1: 'warn', 2: 'info', 3: 'verbose', 4: 'debug', 5: 'silly' };

let logger;

if (process.env.NODE_ENV === 'development') {
	logger = createLogger({
		level: process.env.EXTERNAL_BRIDGE_LOGGING_LEVEL || 'debug',
		format: combine(format.colorize(), format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), format.errors({ stack: true }), logFormat),
		transports: [new transports.Console()],
	});
} else {
	logger = createLogger({
		level: process.env.EXTERNAL_BRIDGE_LOGGING_LEVEL || 'info',
		format: combine(format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), format.errors({ stack: true }), format.json()),
		defaultMeta: { service: 'external-bridge' },
		transports: [new transports.Console()],
	});
}

class Logger {
	constructor(_logger) {
		this.logger = _logger;
	}

	info(...args) {
		this.logger.info(...args);
	}

	debug(...args) {
		this.logger.debug(...args);
	}

	error(...args) {
		this.logger.error(...args);
	}

	warn(...args) {
		this.logger.warn(...args);
	}
}

module.exports = new Logger(logger);
