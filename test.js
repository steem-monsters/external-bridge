const bridge = require('./external-bridge');
const logger = require('./logger');

start();

async function start() {
	bridge.init({
		game_api_url: 'http://localhost:3000',
		prefix: 'cmt-dev-sm_',
		api: {
			port: 3100,
			get_status: () => {
				return { chain: 'test', last_updated: new Date() };
			},
		},
	});

	bridge.stream(onTx);
}

async function onTx(tx) {
	logger.info(JSON.stringify(tx));
}
