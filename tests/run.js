const assert = require('assert');
const http = require('http');
const streamer = require('../stream');
const utils = require('../utils');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function testStreamWaitsBeforeCheckpoint() {
	const originalGetHeadBlockNum = utils.getHeadBlockNum;
	const originalGetBlock = utils.getBlock;
	let callbackFinished = false;
	let savedBlock = null;
	let checkpoint = null;

	utils.getHeadBlockNum = async () => 11;
	utils.getBlock = async () => [{ trx_id: 'trx-1', type: 'token_transfer' }];

	try {
		await streamer.start(async () => {
			await wait(10);
			callbackFinished = true;
		}, {
			types: ['token_transfer'],
			load_state: async () => 10,
			save_state: async block => {
				assert.strictEqual(callbackFinished, true);
				savedBlock = block;
			},
			on_checkpoint: async status => {
				checkpoint = status;
				streamer.stop();
			},
			poll_interval_ms: 60000
		});

		assert.strictEqual(savedBlock, 11);
		assert.deepStrictEqual(checkpoint, { last_block_polled: 10, last_block_number_processed: 10 });
		assert.strictEqual(streamer.getStatus().last_block, 10);
	} finally {
		streamer.stop();
		utils.getHeadBlockNum = originalGetHeadBlockNum;
		utils.getBlock = originalGetBlock;
	}
}

async function testRejectedCallbackDoesNotCheckpoint() {
	const originalGetHeadBlockNum = utils.getHeadBlockNum;
	const originalGetBlock = utils.getBlock;
	let saveCount = 0;

	utils.getHeadBlockNum = async () => 11;
	utils.getBlock = async () => [{ trx_id: 'trx-2', type: 'token_transfer' }];

	try {
		await streamer.start(async () => {
			streamer.stop();
			throw new Error('expected callback failure');
		}, {
			types: ['token_transfer'],
			load_state: async () => 10,
			save_state: async () => { saveCount++; },
			poll_interval_ms: 60000
		});

		assert.strictEqual(saveCount, 0);
	} finally {
		streamer.stop();
		utils.getHeadBlockNum = originalGetHeadBlockNum;
		utils.getBlock = originalGetBlock;
	}
}

async function testHttpDiagnostics() {
	const server = http.createServer((req, res) => {
		if(req.url === '/last_block') {
			res.setHeader('Content-Type', 'application/json');
			return res.end(JSON.stringify({ last_block: 123 }));
		}

		if(req.url === '/transactions/by_block?block=100') {
			res.statusCode = 400;
			res.setHeader('Content-Type', 'application/json');
			return res.end(JSON.stringify({ error: 'Block 100 has not been processed yet.' }));
		}

		res.statusCode = 503;
		res.end('upstream unavailable');
	});

	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const port = server.address().port;
	utils.set_options({ game_api_url: `http://127.0.0.1:${port}`, request_timeout_ms: 1000 });

	try {
		assert.strictEqual(await utils.getHeadBlockNum(), 123);
		await assert.rejects(
			utils.getBlock(99),
			error => error.message.includes('HTTP 503') && error.message.includes('upstream unavailable')
		);
		await assert.rejects(
			utils.getBlock(100),
			error => utils.isBlockNotReadyError(error)
		);
	} finally {
		await new Promise(resolve => server.close(resolve));
	}
}

async function testBlockNotReadyIsSilentAndDoesNotCheckpoint() {
	const originalGetHeadBlockNum = utils.getHeadBlockNum;
	const originalGetBlock = utils.getBlock;
	const originalLog = utils.log;
	const messages = [];
	let saveCount = 0;

	utils.getHeadBlockNum = async () => 101;
	utils.getBlock = async () => {
		throw new Error('Block 100 has not been processed yet.');
	};
	utils.log = message => messages.push(String(message));

	try {
		await streamer.start(async () => {}, {
			load_state: async () => 100,
			save_state: async () => { saveCount++; },
			poll_interval_ms: 60000
		});

		assert.strictEqual(saveCount, 0);
		assert.strictEqual(messages.some(message => /has not been processed yet/i.test(message)), false);
		assert.strictEqual(messages.some(message => /Error loading block/i.test(message)), false);
	} finally {
		streamer.stop();
		utils.getHeadBlockNum = originalGetHeadBlockNum;
		utils.getBlock = originalGetBlock;
		utils.log = originalLog;
	}
}

(async () => {
	await testStreamWaitsBeforeCheckpoint();
	await testRejectedCallbackDoesNotCheckpoint();
	await testHttpDiagnostics();
	await testBlockNotReadyIsSilentAndDoesNotCheckpoint();
	console.log('external-bridge tests ok');
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
