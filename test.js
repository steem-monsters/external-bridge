const bridge = require('./external-bridge');

start();

async function start() {
	bridge.init({ 
		logging_level: 4, 
		game_api_url: "http://localhost:3000", 
		prefix: "matt-sm_",
		api: {
			port: 3100,
			get_status: () => { return { chain: 'test', last_updated: new Date() }; }
		}
	});

	bridge.stream(onTx);
}

async function onTx(tx) {
	console.log(tx);
}